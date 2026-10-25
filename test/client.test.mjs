import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import * as ruz from "../dist/ruz/client.js";

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
  ruz.clearCache();
});

/** Подменяет fetch: запоминает запрошенные URL и отвечает заданным телом и content-type. */
function stubFetch(body, contentType = "application/json; charset=utf-8", status = 200) {
  const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push(Object.assign(new URL(url), { init }));
    const text = typeof body === "string" ? body : JSON.stringify(body);
    return new Response(text, { status, headers: { "content-type": contentType } });
  };
  return calls;
}

test("search: возвращает разобранный JSON и передаёт term и type", async () => {
  const calls = stubFetch([{ id: 1, label: "БПИ231", type: "group" }]);
  const result = await ruz.search("БПИ231", "group");
  assert.deepEqual(result, [{ id: 1, label: "БПИ231", type: "group" }]);
  assert.equal(calls[0].pathname, "/api/search");
  assert.equal(calls[0].searchParams.get("term"), "БПИ231");
  assert.equal(calls[0].searchParams.get("type"), "group");
});

test("ответ не JSON (редирект вне сети ВШЭ) — понятная ошибка", async () => {
  stubFetch("<html>Доступ к РУЗ только из внутренней сети</html>", "text/html");
  await assert.rejects(ruz.search("x"), /не JSON.*сети ВШЭ/s);
});

test("HTTP-ошибка — исключение с кодом", async () => {
  stubFetch({}, "application/json", 500);
  await assert.rejects(ruz.search("x"), /RUZ API: HTTP 500 для \/api\/search/);
});

test("поле error в ответе — исключение", async () => {
  stubFetch({ error: "bad request" });
  await assert.rejects(ruz.search("x"), /RUZ API вернул ошибку: bad request/);
});

test("getSchedule: даты по Москве в формате ГГГГ.ММ.ДД при любой TZ хоста", async () => {
  const calls = stubFetch([]);
  // 01:30 МСК 5 января = 22:30 UTC 4 января; 23:00 МСК 11 января = 20:00 UTC.
  await ruz.getSchedule(
    "group",
    42,
    new Date(Date.UTC(2026, 0, 4, 22, 30)),
    new Date(Date.UTC(2026, 0, 11, 20, 0))
  );
  const u = calls[0];
  assert.equal(u.pathname, "/api/schedule/group/42");
  assert.equal(u.searchParams.get("start"), "2026.01.05");
  assert.equal(u.searchParams.get("finish"), "2026.01.11");
  assert.equal(u.searchParams.get("lng"), "1");
});

test("getStudentInfo: ответ без id — ошибка «не найден»", async () => {
  stubFetch({});
  await assert.rejects(ruz.getStudentInfo("a@edu.hse.ru"), /не найден/);
  stubFetch(null);
  await assert.rejects(ruz.getStudentInfo("a@edu.hse.ru"), /не найден/);
});

test("getStudentInfo: id строкой из цифр приводится к числу", async () => {
  stubFetch({ id: "123456", fio: "Иванов" });
  const student = await ruz.getStudentInfo("a@edu.hse.ru");
  assert.equal(student.id, 123456);
  assert.equal(student.fio, "Иванов");
});

test("text/json и +json тоже принимаются как JSON", async () => {
  for (const type of ["text/json", "application/problem+json; charset=utf-8", "Application/JSON"]) {
    stubFetch([], type);
    assert.deepEqual(await ruz.search("abc"), []);
  }
});

test("не JSON и HTTP-ошибка: тело отменяется, а не висит", async () => {
  for (const [contentType, status] of [
    ["text/html", 200],
    ["application/json", 502],
  ]) {
    let cancelled = false;
    const body = new ReadableStream({
      cancel() {
        cancelled = true;
      },
    });
    globalThis.fetch = async () =>
      new Response(body, { status, headers: { "content-type": contentType } });
    await assert.rejects(ruz.search("abc"));
    assert.equal(cancelled, true, `${contentType} ${status}`);
  }
});

test("таймаут во время чтения тела — та же понятная ошибка", async () => {
  globalThis.fetch = async () => {
    const res = new Response("[]", { headers: { "content-type": "application/json" } });
    res.json = async () => {
      throw new DOMException("The operation was aborted due to timeout", "TimeoutError");
    };
    return res;
  };
  await assert.rejects(ruz.search("abc"), /не ответил за 15 с/);
});

test("ошибка поиска не советует проверять id", async () => {
  stubFetch({});
  await assert.rejects(ruz.search("abc"), (err) => !/проверьте id/.test(err.message));
});

test("getSchedule: пути для преподавателя и аудитории", async () => {
  const calls = stubFetch([]);
  const d = new Date(Date.UTC(2026, 0, 5, 9));
  await ruz.getSchedule("lecturer", 7, d, d);
  await ruz.getSchedule("auditorium", 8, d, d);
  assert.equal(calls[0].pathname, "/api/schedule/lecturer/7");
  assert.equal(calls[1].pathname, "/api/schedule/auditorium/8");
});

for (const body of [null, {}]) {
  test(`ответ ${JSON.stringify(body)} вместо массива — ошибка, а не «успех»`, async () => {
    stubFetch(body);
    await assert.rejects(ruz.getSchedule("group", 1, new Date(), new Date()), /ожидался массив/);
    await assert.rejects(ruz.search("abc"), /ожидался массив/);
  });
}

/**
 * Подменяет fetch: ответ (JSON `body`) приходит только после `release()`, а отмена signal
 * прерывает ожидание, как у настоящего fetch.
 */
function stubPendingFetch(body = []) {
  const calls = [];
  let release;
  const released = new Promise((resolve) => {
    release = resolve;
  });
  globalThis.fetch = (url, init) => {
    calls.push(Object.assign(new URL(url), { init }));
    return new Promise((resolve, reject) => {
      init.signal.addEventListener("abort", () => reject(init.signal.reason), { once: true });
      released.then(() =>
        resolve(
          new Response(JSON.stringify(body), { headers: { "content-type": "application/json" } })
        )
      );
    });
  };
  return { calls, release };
}

test("отмена signal клиента прерывает запрос к RUZ", async () => {
  const { calls } = stubPendingFetch();
  const ac = new AbortController();
  const pending = ruz.search("abc", "student", ac.signal);
  ac.abort();
  await assert.rejects(pending, { name: "AbortError" });
  assert.equal(calls[0].init.signal.aborted, true);
});

test("уже отменённый signal — запрос не отправляется", async () => {
  const calls = stubFetch([]);
  await assert.rejects(ruz.search("abc", "student", AbortSignal.abort()), { name: "AbortError" });
  assert.equal(calls.length, 0);
});

test("одновременные одинаковые запросы — один fetch", async () => {
  const { calls, release } = stubPendingFetch([{ id: 1, label: "A", type: "student" }]);
  const both = Promise.all([ruz.search("abc"), ruz.search("abc")]);
  release();
  const [a, b] = await both;
  assert.deepEqual(a, [{ id: 1, label: "A", type: "student" }]);
  assert.deepEqual(b, a);
  assert.equal(calls.length, 1);
});

test("отмена одного из ждущих не прерывает запрос для остальных", async () => {
  const { calls, release } = stubPendingFetch([]);
  const ac = new AbortController();
  const cancelled = ruz.search("abc", "student", ac.signal);
  const other = ruz.search("abc", "student", new AbortController().signal);
  ac.abort();
  await assert.rejects(cancelled, { name: "AbortError" });
  assert.equal(calls[0].init.signal.aborted, false);
  release();
  assert.deepEqual(await other, []);
  assert.equal(calls.length, 1);
});

test("после отмены всех ждущих новый вызов идёт в RUZ заново", async () => {
  const { calls, release } = stubPendingFetch([]);
  const ac = new AbortController();
  const cancelled = ruz.search("abc", "student", ac.signal);
  ac.abort();
  await assert.rejects(cancelled, { name: "AbortError" });
  assert.equal(calls[0].init.signal.aborted, true);
  const fresh = ruz.search("abc");
  release();
  assert.deepEqual(await fresh, []);
  assert.equal(calls.length, 2);
});

test("кэш: повтор в пределах 5 минут не идёт в RUZ, после — идёт", async (t) => {
  const calls = stubFetch([]);
  let now = Date.UTC(2026, 0, 5, 9);
  t.mock.method(Date, "now", () => now);
  await ruz.search("abc");
  now += 5 * 60_000 - 1;
  await ruz.search("abc");
  assert.equal(calls.length, 1);
  now += 1;
  await ruz.search("abc");
  assert.equal(calls.length, 2);
});

test("ответ «не найден» и неожиданной формы не кэшируются", async () => {
  const calls = stubFetch(null);
  await assert.rejects(ruz.getStudentInfo("a@edu.hse.ru"), /не найден/);
  await assert.rejects(ruz.getStudentInfo("a@edu.hse.ru"), /не найден/);
  await assert.rejects(ruz.search("abc"), /ожидался массив/);
  await assert.rejects(ruz.search("abc"), /ожидался массив/);
  assert.equal(calls.length, 4);
});

test("fetch всегда получает signal с таймаутом", async () => {
  const calls = stubFetch([]);
  await ruz.search("abc");
  assert.ok(calls[0].init.signal instanceof AbortSignal);
});

test("таймаут — понятная ошибка про сеть ВШЭ", async () => {
  globalThis.fetch = async () => {
    throw new DOMException("The operation timed out.", "TimeoutError");
  };
  await assert.rejects(ruz.search("abc"), /не ответил за 15 с/);
});

test("toLessonSummary: оставляет только известные непустые поля", () => {
  const summary = ruz.toLessonSummary({
    discipline: "Матан",
    kindOfWork: "Лекция",
    lecturer: "Иванов И.И.",
    auditorium: "R405",
    building: "Покровский б-р, 11",
    date: "2026.01.05",
    beginLesson: "09:30",
    endLesson: "10:50",
    dayOfWeekString: "Пн",
    lecturer_title: "Иванов Иван Иванович",
    subGroup: "1",
    stream: "",
    url1: "",
    lessonOid: 123,
    contentTableOfLessonsOid: 456,
  });
  assert.deepEqual(Object.keys(summary).sort(), [
    "auditorium",
    "beginLesson",
    "building",
    "date",
    "dayOfWeekString",
    "discipline",
    "endLesson",
    "kindOfWork",
    "lecturer",
    "lecturer_title",
    "subGroup",
  ]);
});

test("getSchedule: language en передаётся как lng=2", async () => {
  const calls = stubFetch([]);
  const d = new Date(Date.UTC(2026, 0, 5, 9));
  await ruz.getSchedule("group", 1, d, d, { language: "en" });
  assert.equal(calls[0].searchParams.get("lng"), "2");
});

test("toSearchSummary: известные непустые поля, id строкой приводится к числу", () => {
  assert.deepEqual(
    ruz.toSearchSummary({ id: "12", label: "БПИ231", description: "", type: "group", kind: 3 }),
    { id: 12, label: "БПИ231", type: "group" }
  );
  assert.equal(ruz.toSearchSummary({ id: "abc", label: "x", type: "group" }), undefined);
});

test("toSearchSummary: совпадение без строковых label или type отбрасывается", () => {
  assert.equal(ruz.toSearchSummary({ id: 1, label: "", type: "group" }), undefined);
  assert.equal(ruz.toSearchSummary({ id: 1, label: "БПИ231" }), undefined);
  assert.equal(ruz.toSearchSummary({ id: 1, label: 5, type: "group" }), undefined);
  assert.deepEqual(ruz.toSearchSummary({ id: 1, label: "x", type: "group", description: 3 }), {
    id: 1,
    label: "x",
    type: "group",
  });
});

test("toLessonSummary: поля не строкой и не числом выкидываются", () => {
  assert.deepEqual(
    ruz.toLessonSummary({ discipline: "Матан", subGroup: 2, note: true, stream: {}, url1: NaN }),
    { discipline: "Матан", subGroup: 2 }
  );
});

test("getStudentInfo: только id, fio и info, без служебных полей", async () => {
  stubFetch({ id: 7, fio: "Иванов", info: "БПИ231", uns: "x", email: "a@edu.hse.ru" });
  assert.deepEqual(await ruz.getStudentInfo("a@edu.hse.ru"), {
    id: 7,
    fio: "Иванов",
    info: "БПИ231",
  });
});

test("кэш: повторный запрос не идёт в RUZ, другие параметры — идут", async () => {
  const calls = stubFetch([]);
  const d = new Date(Date.UTC(2026, 0, 5, 9));
  await ruz.getSchedule("group", 1, d, d);
  await ruz.getSchedule("group", 1, d, d);
  assert.equal(calls.length, 1);
  await ruz.getSchedule("group", 1, d, d, { language: "en" });
  await ruz.getSchedule("group", 2, d, d);
  assert.equal(calls.length, 3);
});

test("кэш: ошибка не кэшируется", async () => {
  stubFetch("", "text/plain", 500);
  await assert.rejects(ruz.search("abc"), /HTTP 500/);
  const calls = stubFetch([{ id: 1, label: "x", type: "student" }]);
  assert.equal((await ruz.search("abc")).length, 1);
  assert.equal(calls.length, 1);
});

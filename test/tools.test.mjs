import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { registerRuzTools } from "../dist/ruz/tools.js";

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

/** Собирает зарегистрированные тулы без настоящего McpServer. */
function collectTools() {
  const tools = {};
  registerRuzTools({
    registerTool(name, config, handler) {
      tools[name] = { config, handler };
    },
  });
  return tools;
}

function stubFetch(body) {
  const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push(Object.assign(new URL(url), { init }));
    return new Response(JSON.stringify(body), {
      headers: { "content-type": "application/json" },
    });
  };
  return calls;
}

test("регистрируются все тулы, включая ruz_get_schedule", () => {
  assert.deepEqual(Object.keys(collectTools()).sort(), [
    "ruz_find_person",
    "ruz_get_group_schedule",
    "ruz_get_my_schedule",
    "ruz_get_schedule",
  ]);
});

test("ruz_find_person: пустая и пробельная строка отклоняются схемой", () => {
  const { term } = collectTools().ruz_find_person.config.inputSchema;
  assert.equal(term.safeParse("").success, false);
  assert.equal(term.safeParse("   ").success, false);
  assert.equal(term.safeParse("  Иванов ").data, "Иванов");
});

test("id из строки RUZ приводится к числу, мусор отклоняется", () => {
  const tools = collectTools();
  for (const [name, key] of [
    ["ruz_get_schedule", "id"],
    ["ruz_get_group_schedule", "groupId"],
  ]) {
    const schema = tools[name].config.inputSchema[key];
    assert.equal(schema.parse("123"), 123);
    assert.equal(schema.parse(5), 5);
    assert.equal(schema.safeParse("abc").success, false);
    assert.equal(schema.safeParse(0).success, false);
  }
});

test("ruz_get_my_schedule: id студента из studentinfo идёт в путь расписания", async () => {
  const calls = [];
  globalThis.fetch = async (url) => {
    const u = new URL(url);
    calls.push(u);
    const body = u.pathname === "/api/studentinfo" ? { id: "77", fio: "Иванов" } : [];
    return new Response(JSON.stringify(body), { headers: { "content-type": "application/json" } });
  };
  const res = await collectTools().ruz_get_my_schedule.handler(
    { email: "a@edu.hse.ru", daysAhead: 7, language: "ru" },
    { signal: new AbortController().signal }
  );
  assert.equal(res.isError, undefined);
  const data = JSON.parse(res.content[0].text);
  assert.deepEqual(data.student, { id: 77, fio: "Иванов" });
  assert.deepEqual(data.lessons, []);
  assert.equal(calls[1].pathname, "/api/schedule/student/77");
});

test("ruz_get_schedule: extra.signal доходит до fetch, занятия урезаны до известных полей", async () => {
  const calls = stubFetch([{ discipline: "Матан", date: "2026.01.05", lessonOid: 1 }]);
  const ac = new AbortController();
  const res = await collectTools().ruz_get_schedule.handler(
    { type: "lecturer", id: 5, daysAhead: 7, language: "ru" },
    { signal: ac.signal }
  );
  assert.equal(res.isError, undefined);
  assert.deepEqual(JSON.parse(res.content[0].text).lessons, [
    { discipline: "Матан", date: "2026.01.05" },
  ]);
  assert.equal(calls[0].pathname, "/api/schedule/lecturer/5");
  ac.abort();
  assert.equal(calls[0].init.signal.aborted, true);
});

test("ruz_get_group_schedule: окно daysAhead=1 — один день", async () => {
  const calls = stubFetch([]);
  await collectTools().ruz_get_group_schedule.handler(
    { groupId: 3, daysAhead: 1, language: "ru" },
    { signal: new AbortController().signal }
  );
  assert.equal(calls[0].pathname, "/api/schedule/group/3");
  assert.equal(calls[0].searchParams.get("start"), calls[0].searchParams.get("finish"));
});

test("ruz_find_person: урезает поля, обрезает до limit, отдаёт total", async () => {
  stubFetch([
    { id: 1, label: "Иванов", description: "БПИ231", type: "student", extra: 1 },
    { id: "2", label: "Иванова", type: "student" },
    { id: null, label: "без id", type: "student" },
  ]);
  const res = await collectTools().ruz_find_person.handler(
    { term: "Иван", type: "student", limit: 1 },
    { signal: new AbortController().signal }
  );
  assert.deepEqual(JSON.parse(res.content[0].text), {
    results: [{ id: 1, label: "Иванов", description: "БПИ231", type: "student" }],
    total: 2,
  });
});

test("ruz_get_schedule: startDate и language доходят до RUZ", async () => {
  const calls = stubFetch([{ discipline: "Матан", date: "2026.01.12", subGroup: 1 }]);
  const res = await collectTools().ruz_get_schedule.handler(
    { type: "group", id: 3, startDate: "2026-01-12", daysAhead: 7, language: "en" },
    { signal: new AbortController().signal }
  );
  assert.equal(res.isError, undefined);
  assert.equal(calls[0].searchParams.get("start"), "2026.01.12");
  assert.equal(calls[0].searchParams.get("finish"), "2026.01.18");
  assert.equal(calls[0].searchParams.get("lng"), "2");
  const data = JSON.parse(res.content[0].text);
  assert.equal(data.from, "2026-01-12");
  assert.equal(data.to, "2026-01-18");
});

test("startDate: невалидная дата отклоняется схемой", () => {
  const { startDate } = collectTools().ruz_get_schedule.config.inputSchema;
  assert.equal(startDate.safeParse("2026-01-12").success, true);
  assert.equal(startDate.safeParse(undefined).success, true);
  for (const bad of ["2026-02-30", "12.01.2026", "завтра"]) {
    assert.equal(startDate.safeParse(bad).success, false, bad);
  }
});

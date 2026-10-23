import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import * as ruz from "../dist/ruz/client.js";

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

/** Подменяет fetch: запоминает запрошенные URL и отвечает заданным телом и content-type. */
function stubFetch(body, contentType = "application/json; charset=utf-8", status = 200) {
  const calls = [];
  globalThis.fetch = async (url) => {
    calls.push(new URL(url));
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
  await assert.rejects(ruz.search("x"), /RUZ API error 500/);
});

test("поле error в ответе — исключение", async () => {
  stubFetch({ error: "bad request" });
  await assert.rejects(ruz.search("x"), /bad request/);
});

test("getGroupSchedule: даты в локальном формате ГГГГ.ММ.ДД", async () => {
  const calls = stubFetch([]);
  await ruz.getGroupSchedule(42, new Date(2026, 0, 5, 1, 30), new Date(2026, 0, 12, 23, 0));
  const u = calls[0];
  assert.equal(u.pathname, "/api/schedule/group/42");
  assert.equal(u.searchParams.get("start"), "2026.01.05");
  assert.equal(u.searchParams.get("finish"), "2026.01.12");
  assert.equal(u.searchParams.get("lng"), "1");
});

test("getStudentInfo: ответ без id — ошибка «не найден»", async () => {
  stubFetch({});
  await assert.rejects(ruz.getStudentInfo("a@edu.hse.ru"), /не найден/);
});

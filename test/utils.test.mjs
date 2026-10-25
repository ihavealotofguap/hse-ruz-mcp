import assert from "node:assert/strict";
import { test } from "node:test";
import { addDays, formatMoscowDate } from "../dist/date-utils.js";
import { runTool } from "../dist/mcp-utils.js";
import { scheduleWindow } from "../dist/ruz/tools.js";

test("runTool: результат сериализуется в компактный JSON", async () => {
  const res = await runTool(async () => ({ a: [1, 2] }));
  assert.deepEqual(res, { content: [{ type: "text", text: '{"a":[1,2]}' }] });
});

test("runTool: строка возвращается как есть, undefined — как null", async () => {
  assert.equal((await runTool(async () => "привет")).content[0].text, "привет");
  assert.equal((await runTool(async () => undefined)).content[0].text, "null");
});

test("runTool: исключение превращается в isError-ответ", async () => {
  const res = await runTool(async () => {
    throw new Error("сломалось");
  });
  assert.equal(res.isError, true);
  assert.equal(res.content[0].text, "Ошибка: сломалось");
});

test("runTool: signal передаётся в тело тула", async () => {
  const ac = new AbortController();
  let received;
  await runTool(async (signal) => {
    received = signal;
  }, ac.signal);
  assert.equal(received, ac.signal);
});

test("formatMoscowDate: граница суток UTC/МСК", () => {
  // 20:59 UTC = 23:59 МСК того же дня, 21:00 UTC = 00:00 МСК следующего.
  assert.equal(formatMoscowDate(new Date(Date.UTC(2026, 0, 4, 20, 59)), "."), "2026.01.04");
  assert.equal(formatMoscowDate(new Date(Date.UTC(2026, 0, 4, 21, 0)), "."), "2026.01.05");
  assert.equal(formatMoscowDate(new Date(Date.UTC(2026, 11, 31, 21, 0)), "-"), "2027-01-01");
});

test("addDays: сдвиг на сутки, через границу месяца и назад", () => {
  const d = new Date(Date.UTC(2026, 0, 31, 9));
  assert.equal(formatMoscowDate(addDays(d, 1), "."), "2026.02.01");
  assert.equal(formatMoscowDate(addDays(d, -31), "."), "2025.12.31");
});

test("scheduleWindow: daysAhead дней включительно, начиная с сегодня", () => {
  const now = new Date(Date.UTC(2026, 0, 4, 22, 30)); // пн 05.01 01:30 МСК
  const { from, to } = scheduleWindow(7, undefined, now);
  assert.equal(formatMoscowDate(from, "."), "2026.01.05");
  assert.equal(formatMoscowDate(to, "."), "2026.01.11");
  assert.equal(formatMoscowDate(scheduleWindow(1, undefined, now).to, "."), "2026.01.05");
});

test("scheduleWindow: startDate — день по Москве при любой TZ хоста", () => {
  const now = new Date(Date.UTC(2026, 0, 4, 22, 30));
  const { from, to } = scheduleWindow(7, "2026-01-12", now);
  assert.equal(formatMoscowDate(from, "."), "2026.01.12");
  assert.equal(formatMoscowDate(to, "."), "2026.01.18");
  assert.equal(formatMoscowDate(scheduleWindow(1, "2025-12-31", now).to, "."), "2025.12.31");
});

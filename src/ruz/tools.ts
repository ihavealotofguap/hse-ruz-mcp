import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { runTool } from "../mcp-utils.js";
import { addDays } from "../date-utils.js";
import * as ruz from "./client.js";

const SEARCH_TYPES = ["student", "lecturer", "group", "auditorium"] as const;

const DAYS_AHEAD = z
  .number()
  .int()
  .min(1)
  .max(60)
  .default(7)
  .describe("Сколько календарных дней получить, включая сегодня (по московскому времени)");

/** Период из `daysAhead` дней, включая сегодня: RUZ считает `finish` включительно. */
export function scheduleWindow(daysAhead: number, now = new Date()): { from: Date; to: Date } {
  return { from: now, to: addDays(now, daysAhead - 1) };
}

export function registerRuzTools(server: McpServer): void {
  server.registerTool(
    "ruz_find_person",
    {
      title: "Найти в РУЗ",
      description:
        "Поиск студента, преподавателя, группы или аудитории ВШЭ по подстроке (ФИО, номер группы) " +
        "через API RUZ (ruz.hse.ru/api/search). ВАЖНО: RUZ отдаёт данные только из внутренней сети " +
        "ВШЭ (Wi-Fi HSE.Student на кампусе или VPN сотрудника) — вне сети запрос вернёт ошибку. " +
        "Возвращает id и подпись найденных совпадений — id с тем же type передаётся в ruz_get_schedule.",
      inputSchema: {
        term: z
          .string()
          .trim()
          .min(2, "Строка поиска должна содержать хотя бы 2 символа")
          .describe("Строка поиска: часть ФИО, номер группы и т.п."),
        type: z.enum(SEARCH_TYPES).default("student"),
      },
    },
    async ({ term, type }, extra) =>
      runTool((signal) => ruz.search(term, type, signal), extra.signal)
  );

  server.registerTool(
    "ruz_get_schedule",
    {
      title: "Расписание по RUZ id",
      description:
        "Расписание студента, преподавателя, группы или аудитории ВШЭ по RUZ id (узнать id — " +
        "ruz_find_person с тем же type) на заданное число дней, включая сегодня.",
      inputSchema: {
        type: z.enum(SEARCH_TYPES).describe("Тип объекта, как в ruz_find_person"),
        id: z.number().int().positive().describe("RUZ id из ruz_find_person"),
        daysAhead: DAYS_AHEAD,
      },
    },
    async ({ type, id, daysAhead }, extra) =>
      runTool(async (signal) => {
        const { from, to } = scheduleWindow(daysAhead);
        const lessons = await ruz.getSchedule(type, id, from, to, 1, signal);
        return lessons.map(ruz.toLessonSummary);
      }, extra.signal)
  );

  server.registerTool(
    "ruz_get_my_schedule",
    {
      title: "Расписание студента по email",
      description:
        "Расписание занятий студента ВШЭ по его корпоративному email (login@edu.hse.ru) на заданное " +
        "число дней, включая сегодня. Использует API RUZ, который отдаёт данные только из внутренней " +
        "сети ВШЭ (Wi-Fi HSE.Student на кампусе или VPN) — вне сети запрос вернёт ошибку.",
      inputSchema: {
        email: z.string().email().describe("Корпоративный email студента, напр. ivanov@edu.hse.ru"),
        daysAhead: DAYS_AHEAD,
      },
    },
    async ({ email, daysAhead }, extra) =>
      runTool(async (signal) => {
        const student = await ruz.getStudentInfo(email, signal);
        const { from, to } = scheduleWindow(daysAhead);
        const lessons = await ruz.getSchedule("student", student.id, from, to, 1, signal);
        return { student, lessons: lessons.map(ruz.toLessonSummary) };
      }, extra.signal)
  );

  server.registerTool(
    "ruz_get_group_schedule",
    {
      title: "Расписание группы",
      description:
        "Расписание занятий учебной группы ВШЭ по её RUZ id (узнать id — ruz_find_person с type=group) " +
        "на заданное число дней, включая сегодня.",
      inputSchema: {
        groupId: z.number().int().positive().describe("RUZ id группы"),
        daysAhead: DAYS_AHEAD,
      },
    },
    async ({ groupId, daysAhead }, extra) =>
      runTool(async (signal) => {
        const { from, to } = scheduleWindow(daysAhead);
        const lessons = await ruz.getGroupSchedule(groupId, from, to, 1, signal);
        return lessons.map(ruz.toLessonSummary);
      }, extra.signal)
  );
}

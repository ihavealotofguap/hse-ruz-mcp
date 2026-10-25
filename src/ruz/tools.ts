import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { addDays, formatMoscowDate } from "../date-utils.js";
import { runTool } from "../mcp-utils.js";
import * as ruz from "./client.js";

// coerce: RUZ в части версий API отдаёт id строкой, и модель передаёт его как есть.
const RUZ_ID = z.coerce.number().int().positive();

// coerce и здесь: модели иногда передают числа строками.
const DAYS_AHEAD = z.coerce
  .number()
  .int()
  .min(1)
  .max(60)
  .default(7)
  .describe("Сколько календарных дней получить, начиная со startDate (по умолчанию с сегодня)");

const START_DATE = z.iso
  .date()
  .optional()
  .describe(
    "Первый день периода, ГГГГ-ММ-ДД по московскому времени (можно в прошлом). По умолчанию сегодня"
  );

const LANGUAGE = z
  .enum(Object.keys(ruz.LANGUAGES) as [ruz.Language, ...ruz.Language[]])
  .default("ru")
  .describe("Язык названий дисциплин, аудиторий и т.п.: ru или en");

// Все тулы только читают RUZ — внешний сервис, ответ которого меняется со временем.
const READ_ONLY = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: true,
} as const;

// Поля занятия RUZ — строки, но часть версий API отдаёт числа (подгруппа и т.п.).
const LESSON_SCHEMA = z.object(
  Object.fromEntries(
    ruz.LESSON_FIELDS.map((key) => [key, z.union([z.string(), z.number()]).optional()])
  )
);

const SCHEDULE_OUTPUT = {
  from: z.string().describe("Первый день периода, ГГГГ-ММ-ДД"),
  to: z.string().describe("Последний день периода включительно, ГГГГ-ММ-ДД"),
  lessons: z.array(LESSON_SCHEMA),
};

/**
 * Период из `daysAhead` дней, начиная со `startDate` (ГГГГ-ММ-ДД по МСК) или с сегодня: RUZ
 * считает `finish` включительно. Дата берётся в полдень МСК, чтобы день не сдвигался.
 */
export function scheduleWindow(
  daysAhead: number,
  startDate?: string,
  now = new Date()
): { from: Date; to: Date } {
  const from = startDate ? new Date(`${startDate}T12:00:00+03:00`) : now;
  return { from, to: addDays(from, daysAhead - 1) };
}

interface ScheduleOptions {
  daysAhead: number;
  startDate?: string;
  language: ruz.Language;
}

/** Расписание за период, урезанное до известных полей, вместе с фактическими датами периода. */
async function scheduleSummary(
  type: ruz.ScheduleType,
  id: number,
  { daysAhead, startDate, language }: ScheduleOptions,
  signal?: AbortSignal
): Promise<{ from: string; to: string; lessons: ruz.LessonSummary[] }> {
  const { from, to } = scheduleWindow(daysAhead, startDate);
  const lessons = await ruz.getSchedule(type, id, from, to, { language, signal });
  return {
    from: formatMoscowDate(from, "-"),
    to: formatMoscowDate(to, "-"),
    lessons: lessons.map(ruz.toLessonSummary),
  };
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
        "Возвращает до limit совпадений (id и подпись) и их общее число total — id с тем же type " +
        "передаётся в ruz_get_schedule. Если total больше limit, уточните запрос.",
      inputSchema: {
        term: z
          .string()
          .trim()
          .min(2, "Строка поиска должна содержать хотя бы 2 символа")
          .describe("Строка поиска: часть ФИО, номер группы и т.п."),
        type: z.enum(ruz.SEARCH_TYPES).default("student"),
        limit: z.coerce
          .number()
          .int()
          .min(1)
          .max(100)
          .default(20)
          .describe("Сколько совпадений вернуть"),
      },
      outputSchema: {
        results: z.array(
          z.object({
            id: z.number(),
            label: z.string(),
            description: z.string().optional(),
            type: z.string(),
          })
        ),
        total: z.number().describe("Сколько совпадений нашёл RUZ, до обрезки по limit"),
      },
      annotations: READ_ONLY,
    },
    async ({ term, type, limit }, extra) =>
      runTool(async (signal) => {
        const results = (await ruz.search(term, type, signal))
          .map(ruz.toSearchSummary)
          .filter((r) => r !== undefined);
        return { results: results.slice(0, limit), total: results.length };
      }, extra.signal)
  );

  server.registerTool(
    "ruz_get_schedule",
    {
      title: "Расписание по RUZ id",
      description:
        "Расписание студента, преподавателя, группы или аудитории ВШЭ по RUZ id (узнать id — " +
        "ruz_find_person с тем же type) на daysAhead дней начиная со startDate (по умолчанию с сегодня).",
      inputSchema: {
        type: z.enum(ruz.SEARCH_TYPES).describe("Тип объекта, как в ruz_find_person"),
        id: RUZ_ID.describe("RUZ id из ruz_find_person"),
        startDate: START_DATE,
        daysAhead: DAYS_AHEAD,
        language: LANGUAGE,
      },
      outputSchema: SCHEDULE_OUTPUT,
      annotations: READ_ONLY,
    },
    async ({ type, id, ...options }, extra) =>
      runTool((signal) => scheduleSummary(type, id, options, signal), extra.signal)
  );

  server.registerTool(
    "ruz_get_my_schedule",
    {
      title: "Расписание студента по email",
      description:
        "Расписание занятий студента ВШЭ по его корпоративному email (login@edu.hse.ru) на daysAhead " +
        "дней начиная со startDate (по умолчанию с сегодня). Использует API RUZ, который отдаёт данные " +
        "только из внутренней сети ВШЭ (Wi-Fi HSE.Student на кампусе или VPN) — вне сети запрос " +
        "вернёт ошибку.",
      inputSchema: {
        email: z.email().describe("Корпоративный email студента, напр. ivanov@edu.hse.ru"),
        startDate: START_DATE,
        daysAhead: DAYS_AHEAD,
        language: LANGUAGE,
      },
      outputSchema: {
        student: z
          .object({ id: z.number(), fio: z.string().optional(), info: z.string().optional() })
          .describe("Студент из RUZ studentinfo: id, ФИО (fio) и info"),
        ...SCHEDULE_OUTPUT,
      },
      annotations: READ_ONLY,
    },
    async ({ email, ...options }, extra) =>
      runTool(async (signal) => {
        const student = await ruz.getStudentInfo(email, signal);
        return { student, ...(await scheduleSummary("student", student.id, options, signal)) };
      }, extra.signal)
  );
}

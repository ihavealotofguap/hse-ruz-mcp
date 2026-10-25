import { formatMoscowDate } from "../date-utils.js";

// ВНИМАНИЕ (проверено 2026-09-15): ruz.hse.ru/api/* больше не отвечает JSON напрямую — редиректит
// на https://www.hse.ru/eduland/schedule/ со страницей "Доступ к РУЗ осуществляется только из
// внутренней сети НИУ ВШЭ" (нужен Wi-Fi HSE.Student на кампусе или VPN сотрудника). Этот модуль
// рабочий, но только пока машина, на которой запущен сервер, находится в сети ВШЭ.
const BASE_URL = "https://ruz.hse.ru/api";
// Без лимита запрос вне сети ВШЭ может висеть до TCP-таймаута ОС (минуты).
const RUZ_TIMEOUT_MS = 15_000;

export interface StudentInfo {
  id: number;
  uns: string;
  email: string;
  fio: string;
  info: string;
}

export interface Lesson {
  discipline: string;
  kindOfWork: string;
  lecturer: string;
  auditorium: string;
  building: string;
  date: string;
  beginLesson: string;
  endLesson: string;
  dayOfWeekString: string;
  group?: string;
  url1?: string;
  url1Description?: string;
  url2?: string;
  url2Description?: string;
  [key: string]: unknown;
}

export type SearchPersonType = "student" | "lecturer" | "group" | "auditorium";
export type ScheduleType = SearchPersonType;

export interface SearchResult {
  id: number;
  label: string;
  type: string;
  [key: string]: unknown;
}

async function ruzGet<T>(
  path: string,
  params: Record<string, string | number>,
  signal?: AbortSignal
): Promise<T> {
  const url = new URL(`${BASE_URL}/${path}`);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, String(value));
  }
  const timeout = AbortSignal.timeout(RUZ_TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetch(url, {
      headers: { Accept: "application/json" },
      signal: signal ? AbortSignal.any([timeout, signal]) : timeout,
    });
  } catch (err) {
    // Отмену клиентом пробрасываем как есть; таймаут — объясняем.
    if (err instanceof Error && err.name === "TimeoutError" && !signal?.aborted) {
      throw new Error(
        `RUZ не ответил за ${RUZ_TIMEOUT_MS / 1000} с — вероятно, нет доступа к сети ВШЭ ` +
          "(нужен Wi-Fi HSE.Student на кампусе или VPN сотрудника)."
      );
    }
    throw err;
  }
  if (!response.ok) {
    throw new Error(`RUZ API error ${response.status} for ${url.pathname}`);
  }
  // `fetch` следует редиректу вне сети ВШЭ на HTML-страницу-заглушку автоматически, так что
  // response.ok остаётся true — без этой проверки response.json() падает малопонятным
  // SyntaxError вместо явного объяснения причины.
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    throw new Error(
      "RUZ API вернул не JSON (похоже на редирект вне сети ВШЭ на страницу-заглушку) — нужен " +
        "Wi-Fi HSE.Student на кампусе или VPN сотрудника."
    );
  }
  const data = (await response.json()) as T | { error: string };
  if (data && typeof data === "object" && "error" in data) {
    throw new Error(`RUZ API returned error: ${(data as { error: string }).error}`);
  }
  return data as T;
}

/** RUZ на неизвестный id может ответить `null` или `{}` — не выдаём это за пустой список. */
function ensureArray<T>(data: unknown, what: string): T[] {
  if (!Array.isArray(data)) {
    throw new Error(`RUZ вернул неожиданный ответ для ${what} (ожидался массив) — проверьте id`);
  }
  return data as T[];
}

/** Найти студента ВШЭ по корпоративному email и получить его RUZ id. */
export async function getStudentInfo(email: string, signal?: AbortSignal): Promise<StudentInfo> {
  const data = await ruzGet<StudentInfo>("studentinfo", { email }, signal);
  if (!data || typeof data.id !== "number") {
    throw new Error(`RUZ: студент с email "${email}" не найден (нет id в ответе API)`);
  }
  return data;
}

function toRuzDate(d: Date): string {
  return formatMoscowDate(d, ".");
}

/** Расписание студента, преподавателя, группы или аудитории по RUZ id за период (даты включительно). */
export async function getSchedule(
  type: ScheduleType,
  id: number,
  from: Date,
  to: Date,
  language: 1 | 2 = 1,
  signal?: AbortSignal
): Promise<Lesson[]> {
  const data = await ruzGet<unknown>(
    `schedule/${type}/${id}`,
    { lng: language, start: toRuzDate(from), finish: toRuzDate(to) },
    signal
  );
  return ensureArray<Lesson>(data, `расписания ${type}/${id}`);
}

/** Расписание группы по её RUZ id. */
export function getGroupSchedule(
  groupId: number,
  from: Date,
  to: Date,
  language: 1 | 2 = 1,
  signal?: AbortSignal
): Promise<Lesson[]> {
  return getSchedule("group", groupId, from, to, language, signal);
}

/** Поиск людей/групп/аудиторий по подстроке (ФИО, номер группы и т.п.). */
export async function search(
  term: string,
  type: SearchPersonType = "student",
  signal?: AbortSignal
): Promise<SearchResult[]> {
  const data = await ruzGet<unknown>("search", { term, type }, signal);
  return ensureArray<SearchResult>(data, `поиска "${term}"`);
}

const LESSON_FIELDS = [
  "date",
  "dayOfWeekString",
  "beginLesson",
  "endLesson",
  "discipline",
  "kindOfWork",
  "lecturer",
  "auditorium",
  "building",
  "group",
  "url1",
  "url1Description",
  "url2",
  "url2Description",
] as const;

export type LessonSummary = Partial<Pick<Lesson, (typeof LESSON_FIELDS)[number]>>;

/**
 * Только типизированные поля занятия, без пустых: сырой ответ RUZ содержит десятки служебных
 * полей, и на 60 дней расписание раздувается до сотен КБ в контексте модели.
 */
export function toLessonSummary(lesson: Lesson): LessonSummary {
  const summary: Record<string, unknown> = {};
  for (const key of LESSON_FIELDS) {
    const value = lesson[key];
    if (value !== undefined && value !== null && value !== "") summary[key] = value;
  }
  return summary as LessonSummary;
}

import { formatMoscowDate } from "../date-utils.js";

// ВНИМАНИЕ (проверено 2026-09-15): ruz.hse.ru/api/* больше не отвечает JSON напрямую — редиректит
// на https://www.hse.ru/eduland/schedule/ со страницей "Доступ к РУЗ осуществляется только из
// внутренней сети НИУ ВШЭ" (нужен Wi-Fi HSE.Student на кампусе или VPN сотрудника). Этот модуль
// рабочий, но только пока машина, на которой запущен сервер, находится в сети ВШЭ.
const BASE_URL = "https://ruz.hse.ru/api";
// Без лимита запрос вне сети ВШЭ может висеть до TCP-таймаута ОС (минуты).
const RUZ_TIMEOUT_MS = 15_000;
const NETWORK_HINT = "нужен Wi-Fi HSE.Student на кампусе или VPN сотрудника";
// Повторные вопросы («а завтра?») часто идут в тот же период — не ходим за ним в RUZ снова.
const CACHE_TTL_MS = 5 * 60_000;
const CACHE_MAX_ENTRIES = 100;
const cache = new Map<string, { expires: number; value: unknown }>();

/** Сбрасывает кэш ответов RUZ и незавершённые запросы (для тестов). */
export function clearCache(): void {
  cache.clear();
  inflight.clear();
}

function cacheGet(key: string): unknown {
  const entry = cache.get(key);
  if (!entry) return undefined;
  cache.delete(key);
  if (entry.expires <= Date.now()) return undefined;
  // Переставляем в конец: вытесняется давно не нужная запись, а не часто запрашиваемая.
  cache.set(key, entry);
  return entry.value;
}

function cacheSet(key: string, value: unknown): void {
  cache.delete(key);
  // Map хранит порядок вставки: первая запись — дольше всех не использованная.
  if (cache.size >= CACHE_MAX_ENTRIES) cache.delete(cache.keys().next().value as string);
  cache.set(key, { expires: Date.now() + CACHE_TTL_MS, value });
}

/** Только то, что нужно модели: служебные поля studentinfo (uns, email и т.п.) не отдаём. */
export interface StudentInfo {
  id: number;
  fio?: string;
  info?: string;
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
  /** В новых версиях API RUZ преподаватель приходит в `lecturer_title`, а не в `lecturer`. */
  lecturer_title?: string;
  lecturer_rank?: string;
  group?: string;
  subGroup?: string;
  stream?: string;
  note?: string;
  url1?: string;
  url1Description?: string;
  url2?: string;
  url2Description?: string;
  [key: string]: unknown;
}

export const SEARCH_TYPES = ["student", "lecturer", "group", "auditorium"] as const;
export type SearchPersonType = (typeof SEARCH_TYPES)[number];
export type ScheduleType = SearchPersonType;

/** Значения параметра `lng` RUZ: язык названий дисциплин, аудиторий и т.п. */
export const LANGUAGES = { ru: 1, en: 2 } as const;
export type Language = keyof typeof LANGUAGES;

export interface SearchResult {
  id: number;
  label: string;
  description?: string;
  type: string;
  [key: string]: unknown;
}

interface InFlight {
  promise: Promise<unknown>;
  controller: AbortController;
  /** Сколько вызовов ждут этот запрос; отмена последнего из них отменяет и сам запрос. */
  waiters: number;
}

// Одинаковые запросы, пока первый ещё идёт, ждут его ответа, а не идут в RUZ повторно.
const inflight = new Map<string, InFlight>();

/**
 * GET к RUZ: `parse` проверяет ответ и приводит его к нужному виду. В кэш попадает только то, что
 * `parse` принял: ответ «не найден» или неожиданной формы следующий вызов перепроверит.
 */
async function ruzGet<T>(
  path: string,
  params: Record<string, string | number>,
  parse: (data: unknown) => T,
  signal?: AbortSignal
): Promise<T> {
  const url = new URL(`${BASE_URL}/${path}`);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, String(value));
  }
  const key = url.href;
  const cached = cacheGet(key);
  if (cached !== undefined) return cached as T;
  signal?.throwIfAborted();
  let entry = inflight.get(key);
  // Запрос, который отменили все ждавшие, ещё может висеть в Map до своего завершения.
  if (!entry || entry.controller.signal.aborted) {
    const controller = new AbortController();
    const created: InFlight = {
      promise: fetchRuz(url, parse, controller.signal).finally(() => {
        if (inflight.get(key) === created) inflight.delete(key);
      }),
      controller,
      waiters: 0,
    };
    inflight.set(key, created);
    entry = created;
  }
  return (await join(entry, signal)) as T;
}

/** Ждёт общий запрос; отмена `signal` прерывает только это ожидание, пока запрос ждут другие. */
async function join(entry: InFlight, signal?: AbortSignal): Promise<unknown> {
  entry.waiters++;
  let onAbort: (() => void) | undefined;
  try {
    if (!signal) return await entry.promise;
    const aborted = new Promise<never>((_, reject) => {
      onAbort = () => reject(signal.reason);
      signal.addEventListener("abort", onAbort, { once: true });
    });
    return await Promise.race([entry.promise, aborted]);
  } finally {
    if (onAbort) signal?.removeEventListener("abort", onAbort);
    if (--entry.waiters === 0 && signal?.aborted) entry.controller.abort(signal.reason);
  }
}

async function fetchRuz<T>(url: URL, parse: (data: unknown) => T, signal: AbortSignal): Promise<T> {
  const timeout = AbortSignal.timeout(RUZ_TIMEOUT_MS);
  let data: unknown;
  try {
    const response = await fetch(url, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.any([timeout, signal]),
    });
    if (!response.ok) {
      // Непрочитанное тело держит соединение открытым до сборки мусора.
      await response.body?.cancel();
      throw new Error(`RUZ API: HTTP ${response.status} для ${url.pathname}`);
    }
    // `fetch` следует редиректу вне сети ВШЭ на HTML-страницу-заглушку автоматически, так что
    // response.ok остаётся true — без этой проверки response.json() падает малопонятным
    // SyntaxError вместо явного объяснения причины.
    if (!isJsonContentType(response.headers.get("content-type"))) {
      await response.body?.cancel();
      throw new Error(
        "RUZ API вернул не JSON (похоже на редирект вне сети ВШЭ на страницу-заглушку) — " +
          `${NETWORK_HINT}.`
      );
    }
    // Таймаут действует и на чтение тела, поэтому json() — внутри того же try.
    data = await response.json();
  } catch (err) {
    // Отмену клиентом пробрасываем как есть; таймаут и сетевой сбой — объясняем.
    if (!signal.aborted && err instanceof Error) {
      if (err.name === "TimeoutError") {
        throw new Error(
          `RUZ не ответил за ${RUZ_TIMEOUT_MS / 1000} с — вероятно, нет доступа к сети ВШЭ (${NETWORK_HINT}).`
        );
      }
      // undici сообщает о DNS/TCP/TLS-сбое голым TypeError("fetch failed"), причина — в cause.
      if (err instanceof TypeError) {
        const cause = err.cause instanceof Error ? `: ${err.cause.message}` : "";
        throw new Error(`Не удалось подключиться к RUZ${cause} — ${NETWORK_HINT}.`, { cause: err });
      }
    }
    throw err;
  }
  if (data && typeof data === "object" && "error" in data) {
    const { error } = data as { error: unknown };
    throw new Error(
      `RUZ API вернул ошибку: ${typeof error === "string" ? error : JSON.stringify(error)}`
    );
  }
  // Кэшируем только принятый ответ: ошибку и таймаут следующий вызов перепроверит.
  const value = parse(data);
  cacheSet(url.href, value);
  return value;
}

/** `application/json`, `text/json`, `application/problem+json` и т.п., с параметрами или без. */
function isJsonContentType(contentType: string | null): boolean {
  const mediaType = (contentType ?? "").split(";")[0].trim().toLowerCase();
  return /^[a-z]+\/([\w.-]+\+)?json$/.test(mediaType);
}

/**
 * RUZ на неизвестный id может ответить `null` или `{}` — не выдаём это за пустой список. Элементы,
 * не являющиеся объектами (`null` и т.п.), выкидываются: иначе одно такое ломало бы весь ответ.
 */
function ensureArray<T>(data: unknown, what: string, hint = ""): T[] {
  if (!Array.isArray(data)) {
    throw new Error(`RUZ вернул неожиданный ответ для ${what} (ожидался массив)${hint}`);
  }
  return data.filter((item) => typeof item === "object" && item !== null && !Array.isArray(item));
}

/** RUZ id приходит числом, но в части версий API — строкой из цифр. */
function toRuzId(value: unknown): number | undefined {
  const id = typeof value === "string" && /^\d+$/.test(value) ? Number(value) : value;
  return typeof id === "number" && Number.isSafeInteger(id) && id > 0 ? id : undefined;
}

/** Найти студента ВШЭ по корпоративному email и получить его RUZ id. */
export async function getStudentInfo(email: string, signal?: AbortSignal): Promise<StudentInfo> {
  return ruzGet(
    "studentinfo",
    { email },
    (data) => {
      const info = data as Record<string, unknown> | null;
      const id = toRuzId(info?.id);
      if (!info || id === undefined) {
        throw new Error(`RUZ: студент с email "${email}" не найден (нет id в ответе API)`);
      }
      return { ...pickStrings(info, STUDENT_FIELDS), id };
    },
    signal
  );
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
  { language = "ru", signal }: { language?: Language; signal?: AbortSignal } = {}
): Promise<Lesson[]> {
  return ruzGet(
    `schedule/${type}/${id}`,
    { lng: LANGUAGES[language], start: toRuzDate(from), finish: toRuzDate(to) },
    (data) => ensureArray<Lesson>(data, `расписания ${type}/${id}`, " — проверьте id и type"),
    signal
  );
}

/** Поиск людей/групп/аудиторий по подстроке (ФИО, номер группы и т.п.). */
export async function search(
  term: string,
  type: SearchPersonType = "student",
  signal?: AbortSignal
): Promise<SearchResult[]> {
  return ruzGet(
    "search",
    { term, type },
    (data) => ensureArray<SearchResult>(data, `поиска "${term}"`),
    signal
  );
}

const STUDENT_FIELDS = ["fio", "info"] as const;

const SEARCH_FIELDS = ["label", "description", "type"] as const;

export type SearchSummary = Pick<SearchResult, "id" | "label" | "type"> &
  Partial<Pick<SearchResult, "description">>;

/**
 * Только известные непустые поля совпадения поиска — как и для занятий, без служебных полей RUZ.
 * id приводится к числу. Совпадение без валидного id (его не передать в расписание) или без
 * строковых label и type — `undefined`: иначе ответ не прошёл бы outputSchema и SDK отклонил бы
 * весь вызов тула из-за одного совпадения.
 */
export function toSearchSummary(result: SearchResult): SearchSummary | undefined {
  const id = toRuzId(result.id);
  const fields = pickStrings(result, SEARCH_FIELDS);
  if (id === undefined || fields.label === undefined || fields.type === undefined) return undefined;
  return { ...fields, id } as SearchSummary;
}

/**
 * Непустые строки и конечные числа из `keys`. Остальное (null, "", boolean, объекты) выкидывается:
 * outputSchema тулов допускает только строки и числа, и одно кривое поле ломало бы весь ответ.
 */
function pickNonEmpty(
  source: Record<string, unknown>,
  keys: readonly string[]
): Record<string, string | number> {
  const picked: Record<string, string | number> = {};
  for (const key of keys) {
    const value = source[key];
    if ((typeof value === "string" && value !== "") || Number.isFinite(value)) {
      picked[key] = value as string | number;
    }
  }
  return picked;
}

/** Как `pickNonEmpty`, но только строки — для полей, которые outputSchema описывает как string. */
function pickStrings(
  source: Record<string, unknown>,
  keys: readonly string[]
): Record<string, string> {
  const picked: Record<string, string> = {};
  for (const key of keys) {
    const value = source[key];
    if (typeof value === "string" && value !== "") picked[key] = value;
  }
  return picked;
}

export const LESSON_FIELDS = [
  "date",
  "dayOfWeekString",
  "beginLesson",
  "endLesson",
  "discipline",
  "kindOfWork",
  "lecturer",
  "lecturer_title",
  "lecturer_rank",
  "auditorium",
  "building",
  "group",
  "subGroup",
  "stream",
  "note",
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
  return pickNonEmpty(lesson, LESSON_FIELDS) as LessonSummary;
}

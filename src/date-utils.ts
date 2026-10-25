const MOSCOW_DATE = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/Moscow",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/**
 * Календарная дата момента `d` по Москве — РУЗ ждёт даты в МСК. Не зависит от TZ машины, на
 * которой запущен сервер: ни `toISOString()` (UTC, между 00:00–02:59 МСК даёт "вчера"), ни
 * `getDate()` (локальная TZ хоста — в UTC-контейнере или за границей тоже сдвигает день) не годятся.
 */
export function formatMoscowDate(d: Date, separator: "." | "-"): string {
  const parts = Object.fromEntries(MOSCOW_DATE.formatToParts(d).map((p) => [p.type, p.value]));
  return [parts.year, parts.month, parts.day].join(separator);
}

/** Сдвиг на `days` суток. МСК — фиксированный UTC+3 без перехода на летнее время, так что 24 ч = 1 день. */
export function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 86_400_000);
}

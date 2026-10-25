export interface ToolTextResult {
  [key: string]: unknown;
  content: Array<{ type: "text"; text: string }>;
  structuredContent?: Record<string, unknown>;
  isError?: boolean;
}

function toText(data: unknown): string {
  if (typeof data === "string") return data;
  // JSON.stringify(undefined) возвращает undefined, а не строку — нарушало бы контракт
  // ToolTextResult.content[0].text: string, если какой-то тул когда-нибудь ничего не вернёт.
  // Компактно, без отступов: расписание на 60 дней с отступами занимает заметно больше контекста.
  return JSON.stringify(data === undefined ? null : data);
}

function isPlainObject(data: unknown): data is Record<string, unknown> {
  return typeof data === "object" && data !== null && !Array.isArray(data);
}

/**
 * Оборачивает тело тула: успешный результат сериализуется в JSON-текст, ошибка — в isError-ответ
 * вместо исключения. Объектный результат дублируется в `structuredContent` — его SDK сверяет с
 * `outputSchema` тула, а клиенты без поддержки structured output читают тот же JSON из текста.
 * `signal` (из `extra.signal` SDK) передаётся в `fn`: срабатывает, когда клиент отменил запрос или
 * остановил задачу.
 */
export async function runTool(
  fn: (signal?: AbortSignal) => Promise<unknown>,
  signal?: AbortSignal
): Promise<ToolTextResult> {
  try {
    const result = await fn(signal);
    const content: ToolTextResult["content"] = [{ type: "text", text: toText(result) }];
    return isPlainObject(result) ? { content, structuredContent: result } : { content };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { content: [{ type: "text", text: `Ошибка: ${message}` }], isError: true };
  }
}

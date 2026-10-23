# CLAUDE.md

hse-ruz-mcp — локальный MCP-сервер (stdio) для API RUZ НИУ ВШЭ (`ruz.hse.ru/api`), выделен из
hsemcp. Авторизации нет, API отвечает только из внутренней сети ВШЭ (Wi-Fi `HSE.Student` или VPN).

## Команды

- `npm run build` — `tsc` в `dist/`; `npm run dev` — watch; `npm start` — запуск сервера.
- `npm test` — сборка и `node:test` (`test/*.test.mjs`, `fetch` подменён, без сети). Линтера нет.

## Структура

- `src/index.ts` — `McpServer` + `StdioServerTransport`, регистрирует `registerRuzTools`.
- `src/ruz/client.ts` — HTTP-запросы к RUZ без зависимостей от MCP SDK; ответ не-JSON означает
  редирект вне сети ВШЭ и превращается в понятную ошибку.
- `src/ruz/tools.ts` — тулы `ruz_find_person`, `ruz_get_my_schedule`, `ruz_get_group_schedule`
  (zod-схемы, вызов через `runTool`).
- `src/mcp-utils.ts#runTool` — результат в JSON-текст, исключение в `isError`-ответ.
- `src/date-utils.ts` — даты в локальном поясе (не UTC): RUZ ждёт московскую дату.

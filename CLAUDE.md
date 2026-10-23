# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

hse-ruz-mcp — локальный MCP-сервер (stdio) для API RUZ НИУ ВШЭ (`ruz.hse.ru/api`), выделен из
hsemcp. Авторизации нет, API отвечает только из внутренней сети ВШЭ (Wi-Fi `HSE.Student` или VPN).

## Команды

- `npm run build` — `tsc` в `dist/`; `npm run dev` — watch; `npm start` — запуск сервера.
- `npm test` — сборка и `node:test` (`test/*.test.mjs`, `fetch` подменён, без сети). Линтера нет.
- Один тест: `npm run build && node --test --test-name-pattern="search" test/client.test.mjs`.
  Тесты импортируют `dist/`, поэтому без сборки проверяется старый код.
- Ручная проверка тулов (только из сети ВШЭ): `npx @modelcontextprotocol/inspector node dist/index.js`.

## Структура

- `src/index.ts` — `McpServer` + `StdioServerTransport`, регистрирует `registerRuzTools`.
- `src/ruz/client.ts` — HTTP-запросы к RUZ без зависимостей от MCP SDK; ответ не-JSON означает
  редирект вне сети ВШЭ и превращается в понятную ошибку.
- `src/ruz/tools.ts` — тулы `ruz_find_person`, `ruz_get_my_schedule`, `ruz_get_group_schedule`
  (zod-схемы, вызов через `runTool`).
- `src/mcp-utils.ts#runTool` — результат в JSON-текст, исключение в `isError`-ответ.
- `src/date-utils.ts` — даты в локальном поясе (не UTC): RUZ ждёт московскую дату.

## Соглашения

- ESM (`"type": "module"`): относительные импорты в `src/` пишутся с суффиксом `.js`.
- Описания тулов, сообщения об ошибках и комментарии — на русском. Описания тулов отсылают к
  `elk_get_schedule` из hsemcp как к запасному варианту вне сети ВШЭ.
- В тесты и PR не попадают реальные email, ФИО и ответы API с персональными данными.

## Релиз

Версия живёт в четырёх местах: `package.json`, оба поля `version` в `server.json` и
`version` в `src/index.ts` (последнее CI не проверяет). Затем коммит, тег `vX.Y.Z`,
`git push && git push origin vX.Y.Z`; workflow `Publish` публикует в npm и реестр MCP, а при
ручном запуске пропускает уже опубликованную в npm версию. Подробнее — `CONTRIBUTING.md`.

## Публикация: как настроено и на чём уже спотыкались

- npm: пакет `hse-ruz-mcp`, владелец `ihavealotofguap`. Публикует только workflow `publish.yml`
  через trusted publishing (OIDC, без `NPM_TOKEN`); на npmjs.com trusted publisher настроен на
  `ihavealotofguap/hse-ruz-mcp`, `publish.yml`, без environment, с разрешением `npm publish`.
  Если переименовать `publish.yml` или добавить ему `environment:`, настройку на npmjs.com надо
  пересоздать (поля не редактируются).
- На аккаунте npm включена 2FA. Ручной `npm publish` из неинтерактивной консоли (в том числе `!` в
  Claude Code) не может дождаться подтверждения в браузере — только `--otp=<код>` или обычный
  терминал. Новый пакет без trusted publisher npm кладёт в staged publishing (заглушка
  `0.0.0-stage`, версия ждёт Approve на npmjs.com).
- Реестр MCP: `io.github.ihavealotofguap/hse-ruz-mcp`, вход `mcp-publisher login github-oidc`.
  Реестр проверяет, что версия уже есть в npm, а свежая версия появляется там через 1–3 минуты —
  поэтому в workflow шаг «Wait for npm».
- Тег пушить явно (`git push origin vX.Y.Z`): `--follow-tags` не отправляет легковесные теги.
- Опубликованы 0.1.0 (вручную), 0.1.1 и 0.1.2 (workflow; в 0.1.1 реестр дотянут ручным запуском).

## История

- Выделен 2026-10-23 из hsemcp (`src/services/ruz` на коммите `28a1844`) без переноса истории git;
  имена и схемы тулов сохранены. В hsemcp RUZ удалён вместе с запасным источником расписания для
  сводок `my_*` (ветка `remove-ruz`).
- Открытые PR dependabot на момент 0.1.2: zod 4 (#1 и #6 — дубли), TypeScript 7 (#5, CI падает),
  @types/node 26 (#4), actions/checkout 7 (#2), actions/setup-node 7 (#3). Мажорные не мержились:
  zod 4 и TS 7 требуют проверки совместимости с `@modelcontextprotocol/sdk`.

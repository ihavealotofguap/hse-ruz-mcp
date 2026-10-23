# Участие в разработке

1. Node.js 22+, `npm install`.
2. `npm test` собирает проект и запускает тесты (`node:test`, `fetch` подменён, сеть ВШЭ не нужна).
3. Тулы вручную проверяйте из сети ВШЭ (Wi-Fi `HSE.Student` или VPN), например через
   `npx @modelcontextprotocol/inspector node dist/index.js`.

Код: логика запросов лежит в `src/ruz/client.ts` (без зависимостей от MCP SDK), регистрация тулов
в `src/ruz/tools.ts`.

## Релиз

1. Поднять версию в `package.json`, в обоих полях `version` в `server.json` и в `src/index.ts`.
2. Коммит, тег `vX.Y.Z`, `git push && git push origin vX.Y.Z`.
3. Workflow `Publish` опубликует пакет в npm и сервер в реестр MCP. Если упал только шаг реестра,
   запустите `Publish` вручную (Actions → Publish → Run workflow): версию в npm он пропустит.

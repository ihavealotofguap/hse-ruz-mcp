# Участие в разработке

1. Node.js 22+, `npm install`.
2. `npm test` собирает проект и запускает тесты (`node:test`, `fetch` подменён, сеть ВШЭ не нужна).
   `npm run lint` проверяет линтер и формат (Biome), `npm run format` форматирует код.
3. Тулы вручную проверяйте из сети ВШЭ (Wi-Fi `HSE.Student` или VPN), например через
   `npx @modelcontextprotocol/inspector node dist/index.js`.

Код: логика запросов лежит в `src/ruz/client.ts` (без зависимостей от MCP SDK), регистрация тулов
в `src/ruz/tools.ts`.

## Релиз

Релизить вручную не нужно: после мержа в master, если менялся `src/`, workflow `Publish` сам
поднимает patch-версию (коммит «Release X.Y.Z» и тег `vX.Y.Z`) и публикует пакет в npm и сервер
в реестр MCP.

Для minor или major поднимите версию в `package.json` и в обоих полях `version` в `server.json`
прямо в PR — после мержа опубликуется она, без бампа. Тег ставить не нужно.

Если упал только шаг реестра, запустите `Publish` вручную (Actions → Publish → Run workflow):
версию в npm он пропустит.

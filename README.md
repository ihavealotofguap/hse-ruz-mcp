# hse-ruz-mcp

[![CI](https://github.com/ihavealotofguap/hse-ruz-mcp/actions/workflows/ci.yml/badge.svg)](https://github.com/ihavealotofguap/hse-ruz-mcp/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/hse-ruz-mcp)](https://www.npmjs.com/package/hse-ruz-mcp)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

Локальный MCP-сервер (stdio) для расписания НИУ ВШЭ через API RUZ (`ruz.hse.ru/api`): ищет
студентов, преподавателей, группы и аудитории, показывает расписание студента по email и расписание группы.
Логин, пароль и браузер не нужны.

## Ограничение: только из сети ВШЭ

RUZ отвечает только из внутренней сети ВШЭ (Wi-Fi `HSE.Student` на кампусе или VPN сотрудника). Вне
её API перенаправляет на HTML-заглушку, и tools возвращают ошибку с объяснением.

## Установка

Нужен Node.js 22+.

### Claude Code

```sh
claude mcp add hse-ruz-mcp -- npx -y hse-ruz-mcp
```

### Claude Desktop, Cursor и другие клиенты

```json
{
  "mcpServers": {
    "hse-ruz-mcp": {
      "command": "npx",
      "args": ["-y", "hse-ruz-mcp"]
    }
  }
}
```

### Из исходников

```sh
git clone https://github.com/ihavealotofguap/hse-ruz-mcp.git
cd hse-ruz-mcp
npm install
npm run build
claude mcp add hse-ruz-mcp -- node <путь-к-проекту>/dist/index.js
```

## Tools

| Tool | Что делает |
|------|------------|
| `ruz_find_person` | Ищет студента, преподавателя, группу или аудиторию по подстроке (от 2 символов) и возвращает id (`type`: `student` по умолчанию, `lecturer`, `group`, `auditorium`) |
| `ruz_get_schedule` | Возвращает расписание студента, преподавателя, группы или аудитории по RUZ id из `ruz_find_person` (с тем же `type`) на 1–60 дней, включая сегодня (по умолчанию 7) |
| `ruz_get_my_schedule` | Возвращает расписание студента по корпоративному email (`login@edu.hse.ru`) на 1–60 дней, включая сегодня (по умолчанию 7) |
| `ruz_get_group_schedule` | Возвращает расписание группы по RUZ id (id берётся из `ruz_find_person` с `type=group`) на 1–60 дней, включая сегодня (по умолчанию 7) |

Даты считаются по московскому времени при любой часовой зоне машины. Запрос к RUZ прерывается через 15 секунд или когда клиент отменяет вызов.

### Примеры запросов

- «Какие у меня пары завтра? Мой email login@edu.hse.ru»
- «Найди группу БПИ231 и покажи её расписание на неделю»

## Разработка

- `npm run build` собирает проект в `dist/`, `npm run dev` собирает в режиме watch.
- `npm test` собирает проект и запускает тесты `node:test` (`test/*.test.mjs`, `fetch` подменён, сеть не нужна).

Участие в разработке и выпуск релизов описаны в [CONTRIBUTING.md](CONTRIBUTING.md).

## Лицензия

[MIT](LICENSE)

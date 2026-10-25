# hse-ruz-mcp

[![CI](https://github.com/ihavealotofguap/hse-ruz-mcp/actions/workflows/ci.yml/badge.svg)](https://github.com/ihavealotofguap/hse-ruz-mcp/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/hse-ruz-mcp)](https://www.npmjs.com/package/hse-ruz-mcp)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

Локальный MCP-сервер (stdio) для расписания НИУ ВШЭ через API RUZ (`ruz.hse.ru/api`): ищет
студентов, преподавателей, группы и аудитории и показывает их расписание (студента — в том числе по email).
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
| `ruz_find_person` | Ищет студента, преподавателя, группу или аудиторию по подстроке (от 2 символов) и возвращает до `limit` совпадений (по умолчанию 20) с id и общим числом `total` (`type`: `student` по умолчанию, `lecturer`, `group`, `auditorium`) |
| `ruz_get_schedule` | Возвращает расписание студента, преподавателя, группы или аудитории по RUZ id из `ruz_find_person` (с тем же `type`) |
| `ruz_get_my_schedule` | Возвращает расписание студента по корпоративному email (`login@edu.hse.ru`) |

Параметры периода у всех тулов расписания:

- `startDate` — первый день, `ГГГГ-ММ-ДД` (можно в прошлом), по умолчанию сегодня;
- `daysAhead` — сколько дней, 1–60, по умолчанию 7;
- `language` — язык названий дисциплин и аудиторий: `ru` (по умолчанию) или `en`.

Расписание возвращается как `{ from, to, lessons }`, где `from` и `to` — фактические даты периода.
Все тулы только читают данные (аннотация `readOnlyHint`) и описывают формат ответа в `outputSchema`.

Даты считаются по московскому времени при любой часовой зоне машины. Запрос к RUZ прерывается через 15 секунд или когда клиент отменяет вызов.

### Примеры запросов

- «Какие у меня пары завтра? Мой email login@edu.hse.ru»
- «Найди группу БПИ231 и покажи её расписание на неделю»
- «Какие пары у преподавателя Иванова на следующей неделе с понедельника?»

## Разработка

- `npm run build` собирает проект в `dist/`, `npm run dev` собирает в режиме watch.
- `npm run lint` проверяет код линтером и форматтером [Biome](https://biomejs.dev), `npm run format` исправляет то, что можно исправить автоматически.
- `npm test` собирает проект и запускает тесты `node:test` (`test/*.test.mjs`, `fetch` подменён, сеть не нужна).

Участие в разработке и выпуск релизов описаны в [CONTRIBUTING.md](CONTRIBUTING.md).

## Лицензия

[MIT](LICENSE)

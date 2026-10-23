# hse-ruz-mcp

Локальный MCP-сервер (stdio) для расписания НИУ ВШЭ через API RUZ (`ruz.hse.ru/api`): ищет
студентов, преподавателей, группы и аудитории, показывает расписание студента по email и расписание группы.
Логин, пароль и браузер не нужны.

Выделен из [hsemcp](https://github.com/ihavealotofguap/hsemcp), где остались SmartLMS и Единый личный
кабинет (ЕЛК).

## Ограничение: только из сети ВШЭ

RUZ отвечает только из внутренней сети ВШЭ (Wi-Fi `HSE.Student` на кампусе или VPN сотрудника). Вне
её API перенаправляет на HTML-заглушку, и tools возвращают ошибку с объяснением. Вне кампуса
расписание можно получить через `elk_get_schedule` из hsemcp.

## Установка

Нужен Node.js 22+.

```sh
git clone https://github.com/ihavealotofguap/hse-ruz-mcp.git
cd hse-ruz-mcp
npm install
npm run build
claude mcp add hse-ruz-mcp -- node <путь-к-проекту>/dist/index.js
```

Для Claude Desktop и других клиентов: команда `node`, аргумент: абсолютный путь к `dist/index.js`.

## Tools

| Tool | Что делает |
|------|------------|
| `ruz_find_person` | Ищет студента, преподавателя, группу или аудиторию по подстроке и возвращает id |
| `ruz_get_my_schedule` | Возвращает расписание студента по корпоративному email (`login@edu.hse.ru`) на 1–60 дней вперёд |
| `ruz_get_group_schedule` | Возвращает расписание группы по RUZ id (id берётся из `ruz_find_person` с `type=group`) на 1–60 дней вперёд |

Даты запроса берутся в часовом поясе машины (ожидается московское время).

## Разработка

- `npm run build` собирает проект в `dist/`, `npm run dev` собирает в режиме watch.
- `npm test` собирает проект и запускает тесты `node:test` (`test/*.test.mjs`, `fetch` подменён, сеть не нужна).

## Лицензия

MIT.

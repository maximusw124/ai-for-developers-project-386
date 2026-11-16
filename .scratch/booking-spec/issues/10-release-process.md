# 10: Определить релизный процесс и включение release-please

Type: grilling
Status: resolved
Blocked by: 09

## Question

Каким должен быть релизный процесс и как включить release-please после первой функции?

Решить:

- формат Conventional Commits и проверку сообщений (уже зафиксирован в `AGENTS.md`);
- конфигурация release-please: manifest, пакеты монорепозитория, changelog, теги, стартовая версия;
- когда включать release-please: после мержа первой функции, чтобы не выпускать пустой релиз;
- права GitHub Actions и токен, нужный для создания PR/релизов;
- что считается «первой функцией» для запуска процесса;
- как релизный PR проходит `mise run check` и не ломает e2e;
- нужны ли отдельные релизы для `backend` и `frontend` или один общий.

Связанные тикеты: «Определить план проверок и тест с нарушенным конфликтом», «Собрать спецификацию и нарезать на вертикальные тикеты». Формат — `grilling`; фактическую настройку вынести в отдельный вертикальный тикет после спецификации.

## Answer

### Проверка Conventional Commits

- Политика в `AGENTS.md` остаётся источником истины; автоматика — линт **заголовка PR** через `amannn/action-semantic-pull-request`.
- Стратегия мержа — **squash**: заголовок PR становится коммитом в `main`, поэтому проверки заголовка достаточно.
- Локальные husky/commitlint не вводятся.
- Разрешённые типы расширяются в `AGENTS.md` до `feat|fix|chore|docs|test|refactor|ci`; `perf|build|style|revert` допустимы при необходимости. Scope опционален.
- `!` и `BREAKING CHANGE` допускаются; до 1.0 ломающее изменение поднимает minor (`bump-minor-pre-major`).

### Один общий релиз

- Пакеты `backend`/`frontend` приватные, деплоя и публикации в npm в первой итерации нет; сервис выпускается как единое целое.
- Решение — **один корневой релиз**: один тег `vX.Y.Z`, один `CHANGELOG.md`, версия в корневом `package.json`.
- Отдельные релизы `backend-v*`/`frontend-v*` вводятся только при появлении независимого деплоя.

### Конфигурация release-please

- Manifest-режим, `release-type: node`, единственный пакет `"."`.
- Стартовая версия `0.0.0`; первый `feat` даёт `0.1.0` (pre-1.0).
- Тег с префиксом `v`, `include-component-in-tag: false`.
- `CHANGELOG.md` в корне; GitHub Release не-draft.
- `bump-minor-pre-major: true`.

```jsonc
// release-please-config.json
{
  "release-type": "node",
  "packages": {
    ".": {
      "package-name": "cal-clone",
      "changelog-path": "CHANGELOG.md",
      "include-component-in-tag": false,
      "bump-minor-pre-major": true,
      "bootstrap-sha": "<sha родителя первой функции>"
    }
  },
  "changelog-sections": [
    { "type": "feat", "section": "Features" },
    { "type": "fix", "section": "Bug Fixes" },
    { "type": "docs", "section": "Documentation" },
    { "type": "chore", "hidden": true },
    { "type": "test", "hidden": true },
    { "type": "refactor", "hidden": true },
    { "type": "ci", "hidden": true }
  ]
}
```

`\.release-please-manifest.json` = `{ ".": "0.0.0" }`; в корневой `package.json` добавляется `"version": "0.0.0"`. В `CHANGELOG.md` попадают `feat`, `fix`, `docs`; остальные типы скрыты.

### Когда включать и что такое «первая функция»

- release-please включается **после мержа первого вертикального среза**, который даёт сквозной сценарий: владелец создаёт тип встречи → гость видит доступность и бронирует → владелец видит предстоящую встречу, при зелёном e2e.
- `bootstrap-sha` указывает на **родителя коммита этого среза**, чтобы скаффолд, лендинг и ранняя история не попали в первый релиз.
- Первый релиз — `v0.1.0`.

### Токен и права

- `GITHUB_TOKEN` не подходит: события от него не запускают другие workflow, поэтому `check`/`e2e` на релизном PR не стартуют.
- Используется fine-grained PAT `RELEASE_PLEASE_TOKEN` с правами `contents: write` и `pull-requests: write`, доступом только к этому репозиторию, с истечением и ротацией.
- Workflow задаёт явный блок `permissions: { contents: write, pull-requests: write }`.
- Долгосрочная альтернатива — GitHub App token через `actions/create-github-app-token`.

```yaml
name: release-please
on:
  push:
    branches: [main]
permissions:
  contents: write
  pull-requests: write
jobs:
  release:
    runs-on: ubuntu-latest
    steps:
      - uses: googleapis/release-please-action@v4
        with:
          token: ${{ secrets.RELEASE_PLEASE_TOKEN }}
          config-file: release-please-config.json
          manifest-file: .release-please-manifest.json
```

### Релизный PR и проверки

- Благодаря PAT релизный PR триггерит обычный `ci.yml` (check + e2e Chromium).
- К релизному PR применяются те же обязательные проверки, что и к любому PR; `[skip ci]` и `paths-ignore` для него не вводятся.
- Мерж релизного PR — **вручную** после зелёного CI; auto-merge в первой итерации не включается.
- Защита `main`: обязательные статусы `check`, `e2e`, `pr-title` (и `hexlet-check`, если требуется курсом), squash, линейная история, запрет прямых пушей.

### Границы

- В первой итерации нет публикации в npm, Docker, деплоя, auto-merge и draft-релизов.
- `hexlet-check.yml` не редактируется: он уже запускается на push и теги.
- release-please меняет только версию и `CHANGELOG.md`, не трогая `.scratch/`, код и сгенерированные артефакты.
- Фактическая настройка секретов и защиты ветки выносится в отдельный вертикальный тикет после спецификации; здесь зафиксированы только решения.

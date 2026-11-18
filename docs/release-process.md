# Релизный процесс

Проект выпускается как один корневой пакет `cal-clone`: один тег `vX.Y.Z`, один `CHANGELOG.md` и версия в корневом `package.json`. Отдельных релизов `backend` и `frontend` нет.

## Конфигурация

- `release-please-config.json`: `release-type: node`, единственный пакет `"."`, `bump-minor-pre-major: true`, `include-component-in-tag: false`, `include-v-in-tag: true`, `draft: false`, путь до `CHANGELOG.md`.
- `.release-please-manifest.json`: стартовая версия `"." = "0.0.0"`.
- Корневой `bootstrap-sha`: родитель коммита S06 (`bef3dbc1d281d604106a922d5cf3cbb4cbcd860d`). S06 завершает первую сквозную функцию «владелец создаёт тип → гость бронирует → владелец видит встречу», поэтому первый релиз после S06 будет `v0.1.0`; скаффолд и ранняя история в него не попадают.
- `CHANGELOG.md`: создаётся и обновляется release-please. В разделы попадают `feat`, `fix`, `docs`; остальные типы скрыты.

## Токен и права

`GITHUB_TOKEN` не подходит: созданный им релизный PR не запускает обычный CI. workflow `release-please.yml` использует отдельный секрет `RELEASE_PLEASE_TOKEN` — fine-grained PAT с доступом только к этому репозиторию и правами `contents: write` и `pull-requests: write`. В workflow явно заданы те же `permissions`.

Токен имеет срок действия и ротируется:

1. Создать новый PAT с теми же правами и доступом только к этому репозиторию.
2. Обновить секрет `RELEASE_PLEASE_TOKEN` в настройках Actions репозитория.
3. Проверить, что release-please workflow зелёный, и отозвать старый PAT.
4. Не хранить токен в репозитории и не указывать его в логах.

## Заголовки PR и мерж в `main`

Заголовок каждого PR проверяет workflow `pr-title` через `amannn/action-semantic-pull-request`. Формат — Conventional Commits: `feat`, `fix`, `chore`, `docs`, `test`, `refactor`, `ci`, `perf`, `build`, `style`, `revert`; scope опционален, `!` и `BREAKING CHANGE` допускаются.

Настройки защиты `main`:

- обязательный Pull Request;
- обязательные статусы `check`, `e2e`, `pr-title` (и `hexlet-check`, если требуется курсом);
- только squash merge, линейная история;
- запрет прямых пушей в `main`.

## Релизный PR

После пуша в `main` release-please открывает или обновляет PR с версией, тегом и changelog. К этому PR применяются обычные проверки: `check` и `e2e` из `ci.yml`. `[skip ci]`, `paths-ignore` и auto-merge не используются. Релизный PR мержится вручную только после зелёных проверок; после мержа release-please создаёт тег `vX.Y.Z` и GitHub Release.

Публикация в npm, Docker и деплой в первой итерации отсутствуют. `hexlet-check.yml` не редактируется. release-please меняет только версию и `CHANGELOG.md`, не трогая код, `.scratch/` и сгенерированные артефакты.

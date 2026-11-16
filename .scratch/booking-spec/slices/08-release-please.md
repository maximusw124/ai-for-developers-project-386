# S08: Релизный процесс: release-please после первой функции

**What to build:** После завершения первой сквозной функции включается автоматический релизный процесс. release-please ведёт единый корневой релиз и changelog, открывает релизный PR с версией и тегом, а тот проходит обычные проверки и мержится вручную. Заголовки PR проверяются на Conventional Commits. Публикации в npm, Docker и деплоя нет.

**Blocked by:** S06

**Status:** ready-for-agent

- [ ] `release-please-config.json` и manifest: один корневой пакет, `release-type: node`, старт `0.0.0`, `bump-minor-pre-major`, тег `vX.Y.Z`, `CHANGELOG.md`
- [ ] Workflow release-please с отдельным токеном (`RELEASE_PLEASE_TOKEN`) и `permissions: contents: write, pull-requests: write`; токен ротируется
- [ ] Линт заголовка PR на Conventional Commits; инструкция по защите `main`, squash и ручному мержу релизного PR
- [ ] `bootstrap-sha` указывает на родителя первой функции; первый релиз `v0.1.0` после S06
- [ ] Релизный PR запускает `mise run check` и e2e, не использует `[skip ci]`/`paths-ignore`; auto-merge выключен
- [ ] Нет публикации в npm, Docker и деплоя; `hexlet-check.yml` не редактируется

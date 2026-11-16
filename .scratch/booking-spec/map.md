# Карта решений: Согласованная спецификация системы бронирования

## Destination

Согласованная спецификация системы бронирования, по которой можно нарезать вертикальные тикеты: контракт API в TypeSpec, правила времени и занятости, публичный и админский сценарии, план проверок и релизов.

## Notes

- Домен и язык: `GLOSSARY.md`; правила проекта: `AGENTS.md`; принятые архитектурные решения: `docs/adr/0001`–`0004`.
- Итоговая спецификация — `.scratch/booking-spec/spec.md`; вертикальные тикеты — `.scratch/booking-spec/slices/01`–`08`.
- Трекер локальный: карта — `.scratch/booking-spec/map.md`, тикеты — `.scratch/booking-spec/issues/NN-<slug>.md`. Открытые тикеты ищутся по каталогу; фронт — первый открытый тикет без неразрешённых блокеров.
- Типы тикетов: `research`, `prototype`, `grilling`, `task`. Каждый тикет — один вопрос, рассчитанный на одну сессию.
- Для решений вызывать `grilling` и `domain-modeling`; для фактов — `research`; для проверки поведения/UI — `prototype`; для финальной сборки — `to-spec` и `to-tickets`.
- Зафиксировано в первом раунде грилинга: рабочие часы Пн–Пт 09:00–18:00 Europe/Moscow; шаг стартов слотов 30 минут; окно 14 календарных дней начиная с сегодня, только будущие слоты; хранение в SQLite; у типа встречи только id, название, описание и длительность; форма гостя — имя, email, необязательный комментарий; авторизации нет.
- Принцип Design First: контракт в TypeSpec — источник истины; OpenAPI, клиентский SDK и серверные типы генерируются из него.
- Правило занятости: интервалы встреч не пересекаются для любых типов встреч; примыкание разрешено.
- Вне scope первой итерации: отмена/перенос, уведомления, несколько владельцев, настоящая авторизация, slug и место проведения, оплата, внешние календари.

## Decisions so far

- [Исследовать конвейер TypeSpec → OpenAPI → openapi-ts → серверные типы](issues/01-research-typespec-pipeline.md): отдельный workspace `contract/` (TypeSpec 1.18.0), OpenAPI 3.1.0 коммитится, две генерации `@hey-api/openapi-ts` (клиент+SDK для фронтенда, только типы для бэкенда), drift-check в CI.
- [Исследовать SQLite и работу с часовыми поясами на Node 22 и Fastify](issues/02-research-sqlite-timezone.md): `better-sqlite3` + `BEGIN IMMEDIATE` для атомарной проверки и вставки, время в UTC epoch ms, Luxon с явной зоной `Europe/Moscow`.
- [Определить модель данных и схему SQLite](issues/03-data-model-and-schema.md): singleton `owner` с `display_name`; расписание Пн–Пт 09:00–18:00 Europe/Moscow, окно 14 дней и шаг 30 минут — константы домена, без таблиц расписания; `meeting_types(id, name, description, duration_min)` и `bookings(meeting_type_id, start_ms, end_ms, guest_name, guest_email, comment, created_at_ms)`; время — UTC epoch ms; `CHECK (end_ms > start_ms)`, индекс `(start_ms, end_ms)`, `ON DELETE RESTRICT`; без колонки `status`; версионные TS-миграции с `schema_migrations` и идемпотентный сид владельца.
- [Зафиксировать правило занятости и защиту от одновременных бронирований](issues/04-occupancy-and-concurrency.md): полуинтервалы `[start, end)` и предикат `bs < e AND be > s`; занятость глобальная для всех типов; `BEGIN IMMEDIATE` + `busy_timeout` + проверка пересечения и `INSERT` в одной транзакции; `BEFORE INSERT/UPDATE` триггеры с `RAISE(ABORT, 'booking_overlap')` как backstop; проигравший гонку получает `409 slot_taken`, `SQLITE_BUSY` — `503 service_busy`; один процесс и одно соединение в первой итерации.
- [Зафиксировать 14-дневное окно и генерацию слотов](issues/05-window-and-slots.md): якорь — начало текущих суток в `Europe/Moscow`, окно — 14 календарных дней `0..13`; все дни присутствуют в ответе, выходные и пустые дни — с `slots: []`; только слоты со `start > now`; рабочие дни Пн–Пт, сетка стартов 09:00 + 30 минут, валидность `start + duration <= 18:00`; занятость исключается по всем типам; время слотов — UTC ISO с `Z`, группировка по московской `date`; один запрос доступности на всё окно.
- [Спроектировать публичный сценарий гостя](issues/06-guest-flow.md): `/book` с прогрессивным сценарием тип → дата → слот → форма → подтверждение и прямая ссылка `/book/:meetingTypeId`; выбор даты/слота не кодируется в URL; форма появляется после выбора слота; при `409`/`422` контакты сохраняются, слот сбрасывается, доступность перезапрашивается; успех показывает тип, интервал по Москве, владельца и явно сообщает об отсутствии письма; повторная запись через `/book`; обязательный accessibility-минимум; без нового state-менеджера, даты форматируются через `Intl` с `Europe/Moscow`.
- [Согласовать API-контракт в TypeSpec](issues/08-api-contract.md): namespace `BookingApi`, OpenAPI 3.1.0 без URL-версии; публичные пути `/meeting-types`, `/meeting-types/{id}/availability`, `/bookings` и админские `/admin/*` с явными `operationId`; id — положительный `int32`, время — `utcDateTime` ISO с `Z`, дата — `plainDate` по Москве, `durationMin`; архив/восстановление — action-эндпоинты, `DELETE` нет; единая `ApiError { code, message, fieldErrors? }` с кодами `invalid_request` 400, `validation_error` 422, `slot_unavailable` 422, `slot_taken` 409, `not_found` 404, `service_busy` 503, `internal_error` 500; пустые дни/слоты присутствуют; idempotency key не вводится; исходники `contract/*.tsp` пока не созданы — это реализация.
- [Определить план проверок и тест с нарушенным конфликтом](issues/09-test-plan.md): пирамида unit (домен) → API через Fastify `app.inject` против реального SQLite → UI-компоненты (Vitest + Testing Library) → e2e Playwright (Chromium) против реального Fastify + временная БД + Vite; `mise run check` = контракт/drift + Biome + типы + сборка + `npm test` (`TZ=UTC`), e2e отдельным шагом; PR = check + e2e Chromium, nightly = Firefox/WebKit, не-московская `TZ`, mutation-тест и stress гонки; `buildApp({ db, clock, config })` с инъекцией, БД `:memory:`/`mkdtemp`; runtime-валидация — нативные Fastify JSON Schema с маппингом в `ApiError`; флаг `TEST_BREAK_OVERLAP` только при `NODE_ENV=test`, `test:broken-conflict` требует падения спеки; фиксированные часы, без coverage-гейта и без ретраев в PR.
- [Определить релизный процесс и включение release-please](issues/10-release-process.md): Conventional Commits через линт заголовка PR + squash; один корневой релиз `vX.Y.Z` и `CHANGELOG.md`; release-please manifest с `release-type: node`, `0.0.0` → `0.1.0`, `bump-minor-pre-major`; включается после первого сквозного вертикального среза, `bootstrap-sha` отсекает раннюю историю; PAT `RELEASE_PLEASE_TOKEN` + явный `permissions` (иначе релизный PR не триггерит CI); тот же `check`/e2e, ручной мерж; без npm publish/Docker/деплоя/auto-merge; фактическая настройка — отдельный тикет.
- [Собрать спецификацию и нарезать на вертикальные тикеты](issues/11-assemble-spec-and-slice.md): подтверждены швы `buildApp({ db, clock, config })` + `inject`, Testing Library с моком SDK, Playwright с реальным стеком, drift-check и mutation-тест; спецификация в `spec.md` по `to-spec` на русском; нарезка S01–S08 в `slices/` без дробления S01/S05, граф `S01 → S02 → S03 → S04 → S05 → S06 → {S07, S08}` без циклов, каждая вертикаль — одна сессия.

## Not yet specified

- Режим durability SQLite (`synchronous=NORMAL/FULL`); в первой итерации предполагается один процесс и одно соединение.
- Фиксация Node ≥22.18.0 в `mise` (точная версия или lock) — зависит от решения по конвейеру.

## Out of scope

- Отмена и перенос брони.
- Уведомления (email, SMS, календарные приглашения).
- Несколько владельцев, команды, регистрация и настоящая авторизация.
- Slug и место проведения у типа встречи.
- Оплата, интеграции с внешними календарями и видеосвязью.
- Нерабочие дни, отпуска и произвольное расписание (кроме фиксированного Пн–Пт 09:00–18:00).
- Повторяющиеся встречи.

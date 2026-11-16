# 08: Согласовать API-контракт в TypeSpec

Type: grilling
Status: resolved
Blocked by: 01, 03, 04, 05, 06, 07

## Question

Какой API-контракт в TypeSpec описывает все операции сервиса бронирования и закрывает решения по времени, занятости и сценариям?

Контракт должен покрыть:

- админские операции типов встреч: список, создание, чтение, изменение, удаление (если разрешено);
- публичный список типов встреч;
- доступность: запрос слотов на 14-дневное окно для выбранного типа встречи;
- создание бронирования гостем с именем, email и комментарием;
- список предстоящих встреч для владельца;
- единую модель ошибок и коды ответов: невалидный запрос, слот занят, слот вне окна, тип встречи не найден, внутренняя ошибка;
- формат идентификаторов, времени и длительности, а также имена полей и операций;
- версию OpenAPI и правила обратной совместимости на первую итерацию.

Ответ должен быть достаточен, чтобы из TypeSpec сгенерировать OpenAPI, клиентский SDK и серверные типы. Связанные тикеты: «Исследовать конвейер TypeSpec → OpenAPI → openapi-ts → серверные типы», «Определить модель данных и схему SQLite», «Зафиксировать правило занятости и защиту от одновременных бронирований», «Зафиксировать 14-дневное окно и генерацию слотов», «Спроектировать публичный сценарий гостя», «Спроектировать админский сценарий владельца». Формат — `grilling` + `domain-modeling`; результат — ссылка на контракт и ключевые решения.

## Answer

### Общие рамки

- Контракт — отдельный workspace `contract/` на TypeSpec 1.18.0 (тикет 01): источник истины `contract/**/*.tsp`, namespace `BookingApi`, эмитится OpenAPI **3.1.0** в `contract/openapi/openapi.yaml`, файл коммитится. Полная раскладка и команды — в `research/typespec-pipeline.md`.
- Два независимых набора путей: публичный (гость) и `/admin/*` (владелец). Публичные пути никогда не отдают архивные типы; админские отдают. Админка без авторизации, поэтому `/admin` — семантическое разделение поверхностей, а не защита.
- Физического `DELETE` нет: жизненный цикл типа встречи — архив/восстановление (тикет 07).
- `operationId` задаются явно через `@TypeSpec.OpenAPI.operationId` — стабильные имена функций SDK.
- Все списки — плоские массивы без конвертов и пагинации; поля — `camelCase`.

### Маршруты и операции

| Метод | Путь | operationId | Успешный ответ |
| --- | --- | --- | --- |
| GET | `/meeting-types` | `listPublicMeetingTypes` | `200 PublicMeetingType[]` |
| GET | `/meeting-types/{meetingTypeId}/availability` | `getAvailability` | `200 Availability` |
| POST | `/bookings` | `createBooking` | `201 BookingConfirmation` |
| GET | `/admin/owner` | `getOwner` | `200 Owner` |
| PATCH | `/admin/owner` | `updateOwner` | `200 Owner` |
| GET | `/admin/meeting-types` | `listAdminMeetingTypes` | `200 AdminMeetingType[]` |
| GET | `/admin/meeting-types/{meetingTypeId}` | `getAdminMeetingType` | `200 AdminMeetingType` |
| POST | `/admin/meeting-types` | `createMeetingType` | `201 AdminMeetingType` |
| PATCH | `/admin/meeting-types/{meetingTypeId}` | `updateMeetingType` | `200 AdminMeetingType` |
| POST | `/admin/meeting-types/{meetingTypeId}/archive` | `archiveMeetingType` | `200 AdminMeetingType` |
| POST | `/admin/meeting-types/{meetingTypeId}/restore` | `restoreMeetingType` | `200 AdminMeetingType` |
| GET | `/admin/bookings/upcoming` | `listUpcomingBookings` | `200 UpcomingBooking[]` |

Уточнения:

- Отдельного публичного `GET` одного типа нет: `getAvailability` уже возвращает выбранный тип, этого достаточно для `/book/:meetingTypeId`.
- «Чтение» типа из тикета 07 закрывает `getAdminMeetingType`.
- Архив и восстановление — отдельные action-эндпоинты `POST .../archive` и `POST .../restore`, а не запись поля через `PATCH`.
- `PATCH` типа встречи и профиля владельца принимает только изменяемые поля; `id` и `archivedAt` не редактируются.

### Модели

```tsp
model PublicMeetingType {
  id: int32;
  name: string;
  description: string;
  durationMin: int32;
}

model AdminMeetingType {
  ...PublicMeetingType;
  archivedAt: utcDateTime | null;
}

model Owner {
  displayName: string;
}

model Availability {
  meetingType: PublicMeetingType;
  days: DayAvailability[];
}

model DayAvailability {
  date: plainDate;
  slots: Slot[];
}

model Slot {
  start: utcDateTime;
  end: utcDateTime;
}

model CreateBookingRequest {
  meetingTypeId: int32;
  start: utcDateTime;
  guestName: string;
  guestEmail: string;
  comment?: string;
}

model BookingConfirmation {
  id: int32;
  meetingType: PublicMeetingType;
  owner: Owner;
  start: utcDateTime;
  end: utcDateTime;
  guestName: string;
  guestEmail: string;
  comment: string | null;
  createdAt: utcDateTime;
}

model UpcomingBooking {
  id: int32;
  start: utcDateTime;
  end: utcDateTime;
  guestName: string;
  guestEmail: string;
  comment: string | null;
  createdAt: utcDateTime;
  meetingType: UpcomingMeetingType;
}

model UpcomingMeetingType {
  id: int32;
  name: string;
  durationMin: int32;
  archived: boolean;
}
```

Ограничения валидации:

- тип встречи: `name` — 1..100 символов после trim; `description` — 0..2000; `durationMin` — 15..540 и кратно 15 (по тикету 07; в БД допустимо 1..540, контракт строже);
- владелец: `displayName` — 1..100 после trim;
- гость: `guestName` — 1..100 после trim; `guestEmail` — формат email, до 254; `comment` — до 2000, пустая строка нормализуется в `null`;
- дубликаты названий типов разрешены (в контракте и БД нет уникальности).

### Доступность

- `GET /meeting-types/{meetingTypeId}/availability` без query-параметров возвращает всё 14-дневное окно одним ответом.
- `days` всегда содержит ровно 14 элементов по возрастанию даты, включая выходные и пустые дни с `slots: []`.
- `date` — календарная дата `YYYY-MM-DD` в `Europe/Moscow`; `start`/`end` — ISO 8601 UTC с `Z`; группировка по московской дате.
- `meetingType` встроен в ответ, чтобы прямая ссылка `/book/:meetingTypeId` не делала второй запрос.
- Поля `timeZone` в ответе нет: `Europe/Moscow` — доменная константа, клиент форматирует через `Intl` с явной зоной.
- Неизвестный и архивный тип — `404 not_found`.

### Создание брони

- Клиент передаёт только `meetingTypeId`, `start` и контакты гостя. `end` и длительность сервер вычисляет из типа встречи; клиентское значение длительности не принимается (тикет 04).
- Успех — `201 BookingConfirmation` со всем, что нужно экрану подтверждения: тип, интервал, владелец, данные гостя, `createdAt`. Идентификатор брони возвращается, но на экране гостя не обязателен (тикет 06).
- Ошибки: тип не найден/архивный — `404 not_found`; слот в прошлом, вне окна, не на сетке 30 минут или `end > 18:00` — `422 slot_unavailable`; пересечение с существующей бронью — `409 slot_taken`; недоступность записи — `503 service_busy`; невалидные поля — `422 validation_error`.
- Idempotency key не вводится: повторная отправка на занятый слот снова даёт `409`.

### Предстоящие встречи

- `GET /admin/bookings/upcoming` возвращает плоский список, отсортированный по `start` по возрастанию; включаются встречи с `end > now`, включая идущую сейчас.
- Группировку по московской дате выполняет клиент; сервер гарантирует только порядок.
- Архивность типа передаётся булевым флагом `meetingType.archived`, потому что UI показывает только бейдж «Тип в архиве».
- Пагинации и фильтров нет (тикет 07).

### Единая модель ошибок

```tsp
model ApiError {
  code: string;
  message: string;
  fieldErrors?: FieldError[];
}

model FieldError {
  field: string;
  message: string;
}
```

| Условие | HTTP | `code` |
| --- | --- | --- |
| Битый JSON, неверный Content-Type, нечисловой path-id | `400` | `invalid_request` |
| Семантическая невалидность полей | `422` | `validation_error` |
| Тип встречи не найден или архивный | `404` | `not_found` |
| Слот вне окна, в прошлом, не на сетке, за пределами рабочих часов | `422` | `slot_unavailable` |
| Слот занят | `409` | `slot_taken` |
| `SQLITE_BUSY` после `busy_timeout` | `503` | `service_busy` (+ `Retry-After`) |
| Непредвиденная ошибка | `500` | `internal_error` |

Уточнения:

- `fieldErrors` заполняется для `validation_error` (например, пустое имя, неверный email, длительность вне диапазона); для остальных кодов обычно отсутствует.
- Граница `400`/`422`: `400` — только транспортно нечитаемый запрос, `422` — корректно разобранный, но семантически неверный.
- Текст `409` соответствует тикету 04: «Это время уже занято. Выберите другой слот».
- Коды ошибок — `string`, а не enum: добавление нового кода не должно быть ломающим изменением контракта.

### Форматы и имена

- Идентификаторы — положительные `int32` (rowid SQLite); в path — целое число. Нечисловой или `<= 0` path-id — `400 invalid_request`.
- Время — `utcDateTime`, сериализуется в ISO 8601 UTC с `Z`.
- Календарная дата — `plainDate` в формате `YYYY-MM-DD` по Москве.
- Длительность — `durationMin: int32`, целые минуты.
- Поля — `camelCase` (`meetingTypeId`, `durationMin`, `guestEmail`, `archivedAt`, `createdAt`); операции — явные `operationId` из таблицы выше.

### Версия OpenAPI и обратная совместимость

- Эмитится OpenAPI **3.1.0** (тикет 01); версия зафиксирована в `contract/tspconfig.yaml`.
- Префикс версии в URL (`/v1`) не вводится в первой итерации.
- Внутри итерации допускаются только аддитивные изменения: новые операции и новые необязательные поля.
- Ломающее изменение — новый мажорный набор путей (`/v2`) и ADR; старые `operationId` не переименовываются.
- `contract/openapi/openapi.yaml` коммитится; CI проверяет drift через `git diff --exit-code -- contract/openapi`.

### Вне контракта

- Runtime-валидация запросов на бэкенде (JSON Schema/Zod/ручные Fastify-схемы) — решит тикет 09; контракт задаёт только форму данных и ошибок.
- Idempotency key, отмена, уведомления и авторизация остаются вне scope (см. `map.md`).
- Новых терминов в `GLOSSARY.md` нет; отдельный ADR для контракта не требуется — решения зафиксированы здесь.

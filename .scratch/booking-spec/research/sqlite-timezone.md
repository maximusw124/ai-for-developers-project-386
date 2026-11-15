# Исследование: SQLite и часовые пояса на Node 22 + Fastify

Тикет: [02: Исследовать SQLite и работу с часовыми поясами](../issues/02-research-sqlite-timezone.md)
Дата проверки версий и документации: 2026-11-15.

## Краткий ответ

- **Драйвер:** `better-sqlite3` 13.x. Синхронный API, встроенные транзакции (`.immediate()`), готовые бинарники под Windows/Linux/macOS, `engines.node >= 22`.
- **Атомарность:** `BEGIN IMMEDIATE` + `busy_timeout` + `SELECT` пересечения + `INSERT` внутри одной транзакции. Сверху — `BEFORE INSERT/UPDATE` триггер как страховка, плюс `CHECK (end_ms > start_ms)` и индекс по `start_ms`.
- **Хранение времени:** UTC epoch milliseconds (`INTEGER`) в SQLite; никаких «локальных» строк без offset.
- **Часовой пояс:** `Luxon` (или `date-fns-tz`) с явной зоной `Europe/Moscow`. Нативный `Temporal` в Node 22 отсутствует; `Intl` в одиночку неудобен для календарной арифметики.
- **Тесты:** инъекция часов, `vi.useFakeTimers()`/`vi.setSystemTime()`, `TZ=UTC` в CI, гонка воспроизводится двумя соединениями в `worker_threads`, а не `Promise.all` в одном потоке.

---

## 1. Выбор SQLite-драйвера

### 1.1 `better-sqlite3` (рекомендуется)

Проверено по опубликованному пакету `better-sqlite3@13.2.0`:

- `engines: { node: ">=22" }` — совпадает с `mise.toml` (`node = "22"`).
- Зависимость только `node-addon-api ^8.0.0`; сборка на Node-API, а не на V8 ABI, поэтому бинарник не нужно пересобирать под каждую мажорную версию Node.
- В тарболле уже лежат готовые `.node`-файлы:
  `prebuilds/win32-x64.node`, `win32-arm64`, `linux-x64`, `linux-arm64`, `linuxmusl-x64`, `linuxmusl-arm64`, `darwin-x64`, `darwin-arm64`.
- В `package.json` **нет `install`-скрипта**, а `gypfile: false`; значит `npm install` не запускает `node-gyp` и не требует Visual Studio/Python на поддерживаемых платформах.
- Синхронный API: `db.prepare(...).run()`, `db.transaction(fn)` с вариантами `.deferred()`, `.immediate()`, `.exclusive()`. Для нашего сценария это плюс: «проверить и вставить» — обычная синхронная функция без `await` между проверкой и вставкой.
- `new Database(path, { timeout: 5000 })` — это busy timeout в миллисекундах (по умолчанию 5000), то есть ожидание снятия блокировки вместо мгновенного `SQLITE_BUSY`.
- `db.pragma('journal_mode = WAL')` рекомендуется авторами для конкурентных веб-приложений.
- Ограничение: транзакционные функции **не работают с async-функциями**; внутри транзакции нельзя делать `await`. Для нас это естественно, но это надо зафиксировать в правилах кода.

Источники:

- `package.json` 13.2.0: <https://raw.githubusercontent.com/WiseLibs/better-sqlite3/master/package.json>
- список файлов тарболла проверен через `npm pack better-sqlite3@13.2.0 --dry-run --json` (см. `prebuilds/*`)
- API и транзакции: <https://raw.githubusercontent.com/WiseLibs/better-sqlite3/master/docs/api.md>
- производительность и WAL: <https://raw.githubusercontent.com/WiseLibs/better-sqlite3/master/docs/performance.md>
- сборка: <https://raw.githubusercontent.com/WiseLibs/better-sqlite3/master/docs/compilation.md>
- проблемы сборки на Windows: <https://raw.githubusercontent.com/WiseLibs/better-sqlite3/master/docs/troubleshooting.md>

### 1.2 Встроенный `node:sqlite`

Проверено по документации Node 22 (страница v22.23.5):

- Модуль добавлен в v22.5.0, с v22.13.0 доступен без флага `--experimental-sqlite`, но по-прежнему имеет статус **Stability: 1.1 — Active development**.
- Классы `DatabaseSync` и `StatementSync`, API синхронный.
- Опция `timeout` (busy timeout, мс) появилась только в v22.16.0; по умолчанию 0.
- **Нет помощника транзакций** уровня `db.transaction(fn)`. `BEGIN IMMEDIATE`/`COMMIT`/`ROLLBACK` нужно писать вручную и аккуратно обрабатывать ошибки.
- Нет встроенных миграций, бэкап-хелпер появился в v22.16.0.

Вывод: технически пригоден, но экспериментальный статус и отсутствие транзакционной обёртки — плохая база для спецификации, которую будут реализовывать другие люди. Если нужен нулевой native-билд, это запасной вариант, а не основной.

Источник: <https://nodejs.org/docs/latest-v22.x/api/sqlite.html>

### 1.3 Альтернативы `libsql` / Turso

По официальной таблице Turso:

| Пакет | Движок | Конкурентные записи |
| --- | --- | --- |
| `@tursodatabase/database` | Turso (rewrite), локальный/embedded | Да (MVCC) |
| `@tursodatabase/sync` | Turso (rewrite), локальный + облако | Да (MVCC) |
| `@tursodatabase/serverless` | Turso, remote | Да (MVCC) |
| `@libsql/client` | libSQL (форк SQLite), remote/embedded replicas | **Not supported** |

Существенные детали:

- `@libsql/client` — асинхронный клиент; для локального файла работает, но официально не поддерживает конкурентные записи, а интерактивная write-транзакция «держит блокировку записи до commit/rollback с таймаутом 5 секунд». Для строгой сериализации в одном процессе это лишняя сложность.
- `@tursodatabase/database` 0.8.3 — это **другой движок** (Turso rewrite, MVCC), версия 0.x. Он не даёт гарантий совместимости формата с обычным SQLite-файлом (зашифрованные БД точно нельзя открыть обычным SQLite). Для проекта, где SQLite выбран как простой файл, это лишний риск.
- Нам не нужны embedded replicas, sync или remote. Плюсы libSQL здесь не используются.

Источник: <https://docs.turso.tech/sdk/ts/reference>

### 1.4 Сравнение

| Критерий | `better-sqlite3` 13 | `node:sqlite` (Node 22) | `@libsql/client` | `@tursodatabase/database` |
| --- | --- | --- | --- | --- |
| Статус | стабильный | experimental (1.1) | стабильный | 0.x |
| API | sync | sync | async | async |
| Транзакции | `.transaction().immediate()` | вручную | `transaction("write")` | вручную/async |
| `BEGIN IMMEDIATE` | да | да (вручную) | да (`write`) | да |
| Windows без сборки | да, prebuild | встроен в Node | native prebuild | native prebuild |
| Node 22 | да (`>=22`) | да, с 22.13 без флага | да | да |
| Лишние зависимости | `node-addon-api` | нет | платформенные optional | платформенные optional |
| Подходит для «проверить и вставить» | **да** | да, но больше кода | избыточно | избыточно, 0.x |

---

## 2. Атомарность «проверить пересечение и вставить»

### 2.1 Модель интервала

Встречи — полуинтервалы `[start_ms, end_ms)`. Примыкание разрешено: `10:00–11:00` и `11:00–11:30` не пересекаются, `10:30–11:00` пересекаются.

Предикат пересечения для новой брони `S = [s, e)` с существующей `B = [bs, be)`:

```sql
bs < e AND be > s
```

Строгие неравенства с обеих сторон как раз дают разрешённое примыкание.

### 2.2 Транзакции SQLite

Из первичной документации:

- Транзакции `BEGIN...COMMIT` **не вкладываются**; для вложенности — `SAVEPOINT`/`RELEASE`.
- В один момент времени может быть только **одна write-транзакция**; read-транзакций — сколько угодно.
- `BEGIN IMMEDIATE` сразу начинает write-транзакцию, не дожидаясь первого write-выражения. Если другой writer уже активен, `BEGIN IMMEDIATE` может вернуть `SQLITE_BUSY` (с `busy_timeout` — подождёт).
- После успешного `BEGIN IMMEDIATE` последующие операции в этой транзакции уже не упадут с `SQLITE_BUSY` из-за конкуренции за writer-лок.
- Разные соединения видят только **закоммиченные** транзакции; незакоммиченные изменения невидимы.
- В WAL-режиме — snapshot isolation. Если начать с `BEGIN` (deferred), сделать `SELECT`, а потом попытаться писать, можно получить `SQLITE_BUSY_SNAPSHOT`, потому что снимок устарел. Именно поэтому для паттерна «прочитать для проверки, затем записать» нужен `BEGIN IMMEDIATE`, а не `BEGIN DEFERRED`.

Источники:

- <https://www.sqlite.org/lang_transaction.html>
- <https://www.sqlite.org/isolation.html>
- <https://www.sqlite.org/rescode.html#busy_snapshot>
- <https://www.sqlite.org/pragma.html#pragma_busy_timeout>

### 2.3 Рекомендуемый паттерн

```ts
import Database from 'better-sqlite3';

const db = new Database('data/booking.db', { timeout: 5000 });
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

const findOverlap = db.prepare(`
  SELECT 1
  FROM bookings
  WHERE start_ms < @end_ms
    AND end_ms   > @start_ms
  LIMIT 1
`);

const insertBooking = db.prepare(`
  INSERT INTO bookings (meeting_type_id, start_ms, end_ms, guest_name, guest_email, comment, created_at_ms)
  VALUES (@meetingTypeId, @startMs, @endMs, @guestName, @guestEmail, @comment, @createdAtMs)
`);

const createBooking = db.transaction((input: CreateBookingInput) => {
  if (findOverlap.get({ start_ms: input.startMs, end_ms: input.endMs })) {
    throw new BookingConflictError();
  }
  return insertBooking.run(input);
});

// Важно: именно .immediate(), а не обычный вызов
export const bookSlot = (input: CreateBookingInput) => createBooking.immediate(input);
```

Почему это атомарно:

1. `.immediate()` выполняет `BEGIN IMMEDIATE` — writer-лок берётся до `SELECT`.
2. Пока транзакция открыта, другой writer не может начать свою write-транзакцию (ждёт `busy_timeout`).
3. `SELECT` и `INSERT` видят согласованное состояние и коммитятся вместе.
4. Второй запрос после ожидания начнёт новую транзакцию, увидит закоммиченную первую бронь и вернёт конфликт.

Нюанс для нашего деплоя: `better-sqlite3` синхронный, и в одном Node-процессе с одним соединением два обработчика Fastify не могут перемешаться между `SELECT` и `INSERT` — event loop не переключится. То есть в одном процессе гонка невозможна и без транзакции. Но полагаться на это нельзя: появятся несколько процессов/инстансов, воркеры, скрипты обслуживания или переход на async-драйвер. Транзакция — дешёвая страховка и формальная гарантия.

### 2.4 Индексы

```sql
CREATE INDEX idx_bookings_start_end ON bookings (start_ms, end_ms);
```

- Предикат `start_ms < :end` использует индекс по `start_ms` как range-условие.
- Композитный `(start_ms, end_ms)` позволяет проверить `end_ms > :start` без чтения таблицы (covering-подобное поведение).
- Отдельный индекс по `end_ms` не нужен: writer один, таблица маленькая (14 дней, десятки записей), а `start_ms` — самый селективный диапазон.
- Когда появятся отмены, понадобится либо удаление строк, либо частичный индекс `WHERE status = 'active'`, и тот же фильтр в триггере. Сейчас отмен нет — модель проще.

Источник: <https://www.sqlite.org/lang_createindex.html>

### 2.5 Ограничения и триггер как страховка

В SQLite **нет exclusion-constraint** (в отличие от PostgreSQL). `CREATE TABLE` поддерживает `PRIMARY KEY`, `UNIQUE`, `CHECK`, `NOT NULL`, `FOREIGN KEY`; выразить «интервалы не пересекаются» декларативно нельзя.

Что можно и нужно:

```sql
CREATE TABLE bookings (
  id INTEGER PRIMARY KEY,
  meeting_type_id INTEGER NOT NULL REFERENCES meeting_types(id),
  start_ms INTEGER NOT NULL,
  end_ms   INTEGER NOT NULL,
  guest_name TEXT NOT NULL,
  guest_email TEXT NOT NULL,
  comment TEXT,
  created_at_ms INTEGER NOT NULL,
  CHECK (end_ms > start_ms)
);

CREATE TRIGGER bookings_no_overlap_insert
BEFORE INSERT ON bookings
FOR EACH ROW
WHEN EXISTS (
  SELECT 1 FROM bookings b
  WHERE b.start_ms < NEW.end_ms
    AND b.end_ms   > NEW.start_ms
)
BEGIN
  SELECT RAISE(ABORT, 'booking_overlap');
END;

CREATE TRIGGER bookings_no_overlap_update
BEFORE UPDATE OF start_ms, end_ms ON bookings
FOR EACH ROW
WHEN EXISTS (
  SELECT 1 FROM bookings b
  WHERE b.id <> NEW.id
    AND b.start_ms < NEW.end_ms
    AND b.end_ms   > NEW.start_ms
)
BEGIN
  SELECT RAISE(ABORT, 'booking_overlap');
END;
```

- `CHECK (end_ms > start_ms)` отсекает нулевую и отрицательную длительность на уровне схемы.
- Триггер — «последняя линия обороны»: даже если сервисный код забудет проверку или появится прямой SQL/сид, пересечение не запишется.
- Триггер не заменяет прикладную проверку: при конфликте из триггера мы получим `SQLITE_CONSTRAINT_TRIGGER` без деталей, а гостю нужен осмысленный `409`. Поэтому проверка в транзакции — основная, триггер — backstop.
- `RAISE(ABORT)` откатывает текущий оператор и транзакцию; это ожидаемое поведение.

Источники:

- <https://www.sqlite.org/lang_createtable.html>
- <https://www.sqlite.org/lang_createtrigger.html>

### 2.6 WAL и `busy_timeout`

- WAL включает одновременное чтение и запись: читатели не блокируют writer, writer не блокирует читателей. Но writer по-прежнему один.
- `PRAGMA busy_timeout = 5000` заставляет соединение ждать снятия блокировки до 5 с вместо немедленного `SQLITE_BUSY`. В `better-sqlite3` это же задаётся опцией `timeout`.
- В дистрибутиве `better-sqlite3` включён `SQLITE_DEFAULT_WAL_SYNCHRONOUS=1`, то есть в WAL по умолчанию `synchronous=NORMAL`, а не `FULL`. Это быстрее, но при потере питания последние коммиты теоретически могут потеряться. Для бронирований это приемлемый компромисс, но решение стоит зафиксировать; при желании — `db.pragma('synchronous = FULL')`.
- WAL-файл может расти при долгих читателях; в одном процессе это не проблема. Если появятся несколько процессов — нужен периодический `wal_checkpoint`.

Источники:

- <https://www.sqlite.org/wal.html>
- <https://raw.githubusercontent.com/WiseLibs/better-sqlite3/master/docs/performance.md>

---

## 3. Часовой пояс: `Intl`, `date-fns-tz`, `Luxon` или `Temporal`

### 3.1 Ограничения вариантов

| Вариант | Плюсы | Минусы для нас |
| --- | --- | --- |
| `Intl.DateTimeFormat` | встроен, без зависимостей, знает IANA-зоны | умеет форматировать, но не даёт календарной арифметики и удобного «локальное 09:00 → UTC instant»; придётся вручную считать offset через `formatToParts` |
| `date-fns-tz` 3.2 | лёгкий, `formatInTimeZone`, `fromZonedTime`, `toZonedTime`; работает поверх `Intl`, tzdata не бандлит | peer-зависимость `date-fns ^3 || ^4`; календарная арифметика — через `date-fns` |
| `Luxon` 3.7 | полноценные `DateTime` с зоной, `plus({days})`, `startOf('day')`, `setZone`, `fromObject(..., { zone })` | зависимость ~70 КБ; тоже опирается на `Intl`/ICU |
| `Temporal` | лучший API, Stage 4 | **в Node 22 нет**; shipped только в Node 26 (2026-05-05), нужен полифилл |
| Самописный UTC+3 | просто | хрупко: правила зоны могут измениться, нельзя переиспользовать для других зон |

Проверено:

- Temporal — Stage 4, но в Node появился только в 26.0.0. В Node 22 доступен лишь через `@js-temporal/polyfill` 0.5.1 или `temporal-polyfill` 1.0.8.
- `Luxon` 3.7.2: `engines.node >= 12`; зоны задаются явно, `DateTime.fromISO(..., { zone })`, `DateTime.fromObject({...}, { zone })`.
- `date-fns-tz` 3.2.0: peer `date-fns ^3.0.0 || ^4.0.0`; использует `Intl`, не тащит tzdata.
- `Intl.DateTimeFormat` поддерживает `timeZone` и `formatToParts`, но это инструмент форматирования, а не построения календарных дат.

Источники:

- <https://raw.githubusercontent.com/tc39/proposal-temporal/main/README.md>
- <https://raw.githubusercontent.com/moment/luxon/master/docs/zones.md>
- <https://raw.githubusercontent.com/marnusw/date-fns-tz/master/README.md>
- <https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl/DateTimeFormat>

### 3.2 Рекомендация

**Luxon** как основная библиотека для календарной логики (окно, рабочие дни, слоты), потому что:

- зона передаётся явно в каждом вызове, а не берётся из настроек сервера;
- есть арифметика календарных дней (`plus({ days: 1 })`), а не миллисекунд;
- удобно строить локальное время: `DateTime.fromObject({ year, month, day, hour: 9 }, { zone: 'Europe/Moscow' })`;
- легко получить UTC-инстант для хранения: `.toUTC().toMillis()`.

`date-fns-tz` — равнозначная альтернатива, если команда уже использует `date-fns`. Выбирать обе не нужно.

`Intl` оставляем только для форматирования в UI (или используем `Luxon.toFormat`). `Temporal` не берём: полифилл ради двух операций — лишняя зависимость, а нативный API появится только после обновления Node до 26+.

Про `Europe/Moscow`: с 2014-10-26 зона — постоянный UTC+3 без перехода на летнее время (tzdb, файл `europe`). Это упрощает тесты, но **нельзя хардкодить `+03:00`**: clock rules могут измениться, а IANA-имя — стабильный контракт. Источник: <https://raw.githubusercontent.com/eggert/tz/main/europe>

---

## 4. Окно 14 дней и слоты независимо от TZ сервера

### 4.1 Принцип

Сервер не должен использовать `new Date()` в локальной зоне и `getDay()`/`getHours()`. Все решения принимаются в `Europe/Moscow`, все хранения и сравнения — в UTC epoch ms.

- «Сегодня» — это `DateTime.now().setZone('Europe/Moscow').startOf('day')`, а не `new Date()`.
- День недели — `day.weekday` (1 = Пн … 7 = Вс) у даты в московской зоне.
- 09:00 и 18:00 — это `day.set({ hour: 9, minute: 0 })` / `day.set({ hour: 18, minute: 0 })` в той же зоне.
- В SQLite пишем `start_ms`/`end_ms` (UTC epoch ms), сравниваем числа.

### 4.2 Алгоритм

```ts
import { DateTime } from 'luxon';

const ZONE = 'Europe/Moscow';
const WINDOW_DAYS = 14;
const WORK_START_MIN = 9 * 60;
const WORK_END_MIN = 18 * 60;
const STEP_MIN = 30;

export function buildSlots(now: DateTime, durationMin: number, busy: Interval[]) {
  const today = now.setZone(ZONE).startOf('day');
  const days = [];

  for (let offset = 0; offset < WINDOW_DAYS; offset++) {
    const day = today.plus({ days: offset });
    const isWorkday = day.weekday >= 1 && day.weekday <= 5;
    if (!isWorkday) {
      days.push({ date: day.toISODate(), slots: [] });
      continue;
    }

    const dayEnd = day.set({ hour: 18, minute: 0 });
    const slots = [];

    for (let m = WORK_START_MIN; m + durationMin <= WORK_END_MIN; m += STEP_MIN) {
      const start = day.set({ hour: 0, minute: 0 }).plus({ minutes: m });
      const end = start.plus({ minutes: durationMin });

      if (end > dayEnd) continue;          // start + duration <= 18:00
      if (start <= now.setZone(ZONE)) continue; // только будущие слоты

      const startMs = start.toUTC().toMillis();
      const endMs = end.toUTC().toMillis();
      if (busy.some((b) => b.startMs < endMs && b.endMs > startMs)) continue;

      slots.push({ startUtc: start.toUTC().toISO(), endUtc: end.toUTC().toISO() });
    }

    days.push({ date: day.toISODate(), slots });
  }

  return days;
}
```

Замечания:

- Цикл `m + durationMin <= 18*60` уже гарантирует `start + duration <= 18:00`; дополнительная проверка `end > dayEnd` — поясняющая.
- `start <= now` отбрасывает прошедшие слоты сегодняшнего дня. Сравнение идёт в одной зоне, поэтому переход суток не ломает логику.
- Для встречи на 60 минут последний старт — 17:00; для 30 минут — 17:30. Встреча, заканчивающаяся ровно в 18:00, разрешена.
- Слоты не «округляются» к сетке от начала дня в UTC — сетка строится в московском времени. Это критично: 09:00 MSK = 06:00 UTC.
- Если `durationMin` не кратен 30, слоты всё равно начинаются с шагом 30; валидность определяется только `start + duration <= 18:00`.
- Пустые дни (выходные или всё занято) лучше возвращать с `slots: []`, а не выбрасывать — это решение тикета 05, но алгоритм его поддерживает.

### 4.3 Формат хранения и передачи

- В БД: `INTEGER start_ms`, `INTEGER end_ms` (UTC epoch ms). Целое сравнивается быстрее и однозначнее, чем ISO-строка, и не зависит от tzdata.
- В API: ISO 8601 UTC с `Z` (`2026-11-16T06:00:00.000Z`), плюс, при необходимости, `date` в `Europe/Moscow` для группировки по дню. Решение о форме ответа — тикет 08.
- Никогда не передавать «09:00» без даты и зоны и не полагаться на локальную зону клиента при валидации.

---

## 5. Тестирование времени и гонок

### 5.1 Детерминированное время

- **Инъекция часов** — основной способ: сервис принимает `now: () => DateTime` (или `Clock`), в тестах передаётся фиксированный момент. Это не зависит ни от системных часов, ни от `TZ`.
- **Vitest fake timers** — для кода, который использует `Date.now()`/`setTimeout`: `vi.useFakeTimers()`, `vi.setSystemTime(new Date('2026-11-15T09:00:00+03:00'))`, `vi.useRealTimers()` в `afterEach`. Luxon `DateTime.now()` использует `Date.now()`, поэтому fake timers на него действуют; но инъекция часов всё равно чище.
- **`TZ=UTC` в CI и локально** — дополнительная страховка от случайного использования локальной зоны. В GitHub Actions это `env: { TZ: UTC }`; в тестах не полагаться на него как на единственную защиту.
- Тестировать границы: воскресенье/понедельник, 17:30 + 30 мин, 17:30 + 60 мин (невалидно), старт ровно «сейчас» (невалидно), переход через полночь (не должен появляться), 14-й день включительно.

Источник: <https://vitest.dev/api/vi.html>

### 5.2 Воспроизведение гонки

`better-sqlite3` синхронный, поэтому `Promise.all([book(a), book(b)])` в одном потоке **не создаёт гонку**: вызовы выполнятся последовательно. Варианты:

1. **Детерминированный тест сериализации** (быстрый, надёжный):
   - соединение A: `BEGIN IMMEDIATE`, вставка, но без `COMMIT`;
   - соединение B: `busy_timeout = 100`, попытка `.immediate()` → ожидаем `SQLITE_BUSY`;
   - A: `COMMIT`;
   - B: повторяет бронь, видит пересечение → доменный конфликт.
2. **Два worker thread** с отдельными соединениями и барьером (`Atomics.wait`/`SharedArrayBuffer`), чтобы оба стартовали одновременно. Это ближе к реальной конкурентности и проверяет, что один получает успех, другой — конфликт. `better-sqlite3` документирует именно worker-thread паттерн для нескольких соединений.
3. **Два процесса** (`child_process`) — самый тяжёлый, но максимально реалистичный вариант для нескольких инстансов.

Дополнительно:

- Тест триггера: вставить две пересекающиеся брони напрямую через `db.prepare(...).run()`, минуя сервис, и ожидать `SQLITE_CONSTRAINT_TRIGGER`/`RAISE`.
- Тест `CHECK`: вставить `end_ms <= start_ms` и ожидать `SQLITE_CONSTRAINT_CHECK`.
- Тест идемпотентности/повторной отправки — отдельный тикет, но транзакция даёт базу.

Источники:

- worker threads в `better-sqlite3`: <https://raw.githubusercontent.com/WiseLibs/better-sqlite3/master/docs/threads.md>
- `worker_threads` в Node 22: <https://nodejs.org/docs/latest-v22.x/api/worker_threads.html>

### 5.3 Тестирование API

- Fastify `app.inject()` позволяет тестировать маршруты без сетевого порта; удобно для `201`/`409`/`422` и для проверки тела ошибки.
- Для теста гонки через HTTP одного `inject` недостаточно (он последовательный); гонку проверяем на уровне сервиса/БД, как выше.

Источник: <https://fastify.dev/docs/latest/Guides/Testing/>

---

## 6. Рекомендация (для тикетов 03–05, 09)

1. **Драйвер:** `better-sqlite3` 13.x, одно соединение на процесс, `timeout: 5000`, `journal_mode = WAL`, `foreign_keys = ON`.
2. **Схема:** `start_ms`/`end_ms` INTEGER (UTC epoch ms), `CHECK (end_ms > start_ms)`, индекс `(start_ms, end_ms)`.
3. **Запись:** всегда через `db.transaction(fn).immediate()`; внутри — `SELECT` пересечения по всем типам встреч, затем `INSERT`. Конфликт → доменная ошибка → `409`.
4. **Backstop:** `BEFORE INSERT` и `BEFORE UPDATE` триггеры с `RAISE(ABORT)`; при появлении отмен — фильтр по статусу в предикате, индексе и триггере.
5. **Время:** `Luxon` с явной зоной `Europe/Moscow`; хранение и API — UTC; UI форматирует в московскую зону.
6. **Тесты:** инъекция часов + fake timers + `TZ=UTC`; гонка — двумя соединениями (детерминированно) и, желательно, двумя worker threads; отдельные тесты на триггер и `CHECK`.

---

## 7. Открытые вопросы и риски

- **Сколько процессов будет писать в файл?** Если один — WAL и `busy_timeout` почти не влияют. Если несколько инстансов/воркеров — нужны `busy_timeout`, обработка `SQLITE_BUSY`, периодический checkpoint и, возможно, вынос записи в один процесс.
- **Долговечность:** `synchronous=NORMAL` в WAL (значение по умолчанию в этом дистрибутиве) допускает потерю последних коммитов при сбое питания. Нужно осознанно выбрать `NORMAL` или `FULL`.
- **Отмены/переносы** (вне scope): как только появятся, предикат занятости, индекс и триггер должны учитывать статус, иначе отменённая бронь продолжит блокировать слот.
- **Формат ответа API** (тикет 08): только UTC ISO или ещё и локальная дата/время; как клиент группирует слоты по дням.
- **Версия Node в CI и локально:** `mise` даёт Node 22, у разработчика может быть 26. Node-API это терпит, но тесты с `TZ` и ICU стоит прогонять на той же версии, что в CI.
- **Vitest:** в репозитории `^2.1.0`, актуальная 5.1.0 требует Node `^22.12 || ^24 || >=26`. Обновление не обязательно для fake timers, но если делать — проверить CI.
- **Полифилл Temporal** не нужен; если позже понадобится сложная работа с зонами, можно вернуться к `temporal-polyfill` 1.0.8.

---

## 8. Источники

SQLite:

- Транзакции, `BEGIN IMMEDIATE`: <https://www.sqlite.org/lang_transaction.html>
- Изоляция и сериализация: <https://www.sqlite.org/isolation.html>
- WAL: <https://www.sqlite.org/wal.html>
- `SQLITE_BUSY_SNAPSHOT`: <https://www.sqlite.org/rescode.html#busy_snapshot>
- `PRAGMA busy_timeout`: <https://www.sqlite.org/pragma.html#pragma_busy_timeout>
- `CREATE TABLE` (ограничения): <https://www.sqlite.org/lang_createtable.html>
- `CREATE TRIGGER` / `RAISE`: <https://www.sqlite.org/lang_createtrigger.html>
- `CREATE INDEX` (включая partial): <https://www.sqlite.org/lang_createindex.html>

Драйверы:

- `better-sqlite3` 13.2.0 `package.json`: <https://raw.githubusercontent.com/WiseLibs/better-sqlite3/master/package.json>
- `better-sqlite3` API: <https://raw.githubusercontent.com/WiseLibs/better-sqlite3/master/docs/api.md>
- `better-sqlite3` performance/WAL: <https://raw.githubusercontent.com/WiseLibs/better-sqlite3/master/docs/performance.md>
- `better-sqlite3` threads: <https://raw.githubusercontent.com/WiseLibs/better-sqlite3/master/docs/threads.md>
- `better-sqlite3` compilation: <https://raw.githubusercontent.com/WiseLibs/better-sqlite3/master/docs/compilation.md>
- `better-sqlite3` troubleshooting (Windows): <https://raw.githubusercontent.com/WiseLibs/better-sqlite3/master/docs/troubleshooting.md>
- `node:sqlite` Node 22: <https://nodejs.org/docs/latest-v22.x/api/sqlite.html>
- Turso/libSQL TypeScript reference: <https://docs.turso.tech/sdk/ts/reference>

Время:

- Temporal proposal (статус и поставки): <https://raw.githubusercontent.com/tc39/proposal-temporal/main/README.md>
- Luxon zones: <https://raw.githubusercontent.com/moment/luxon/master/docs/zones.md>
- `date-fns-tz`: <https://raw.githubusercontent.com/marnusw/date-fns-tz/master/README.md>
- MDN `Intl.DateTimeFormat`: <https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl/DateTimeFormat>
- tzdb, зона Europe/Moscow: <https://raw.githubusercontent.com/eggert/tz/main/europe>

Тесты:

- Vitest fake timers: <https://vitest.dev/api/vi.html>
- Fastify testing (`app.inject`): <https://fastify.dev/docs/latest/Guides/Testing/>
- Node `worker_threads`: <https://nodejs.org/docs/latest-v22.x/api/worker_threads.html>

# Конвейер Design First: TypeSpec → OpenAPI → @hey-api/openapi-ts → типы бэкенда

Дата: 2026-11-15. Репозиторий: `cal-clone` — npm workspaces `backend`, `frontend` (`package.json`).

## TL;DR

1. Контракт живёт в отдельном workspace `contract/` (TypeSpec), а не в `backend/` или `frontend/`.
2. Источник истины — `contract/**/*.tsp`; из него эмитится **OpenAPI 3.1.0** в `contract/openapi/openapi.yaml`, этот файл коммитится.
3. `@hey-api/openapi-ts` запускается **дважды** из одного и того же YAML:
   - `frontend/openapi-ts.config.ts` → `frontend/src/api/generated/` (Fetch-клиент + SDK + типы);
   - `backend/openapi-ts.config.ts` → `backend/src/api/generated/` (только `types.gen.ts`).
4. Бэкенд **не импортирует фронтенд**: он генерирует собственные типы в `backend/src/api/generated/` (внутри `rootDir: ./src`) и использует их через `import type`.
5. Сгенерированный TypeScript **не коммитится** (это детерминированный build-артефакт); коммитится только OpenAPI. CI перегенерирует всё и проверяет `git diff --exit-code -- contract/openapi`.
6. Обязательное требование по Node — **≥ 22.18.0** (его задаёт `@hey-api/openapi-ts`), TypeScript 5.6 совместим.

---

## 1. Версии и совместимость

Проверено по npm registry (теги `latest` на 2026-11-15):

| Пакет | Версия | Требования | Источник |
| --- | --- | --- | --- |
| Node.js | — | **≥ 22.18.0** (связывающее ограничение) | [@hey-api/openapi-ts latest](https://registry.npmjs.org/@hey-api/openapi-ts/latest) |
| TypeScript | 5.6.x (в репо `^5.6.0`) | hey-api peer: `>=5.5.3 \|\| >=6.0.0` → 5.6 подходит | [@hey-api/openapi-ts latest](https://registry.npmjs.org/@hey-api/openapi-ts/latest), `backend/package.json`, `frontend/package.json` |
| `@typespec/compiler` | 1.18.0 | node `>=22.0.0` | [registry](https://registry.npmjs.org/@typespec/compiler/latest) |
| `@typespec/http` | 1.18.0 | node `>=22.0.0`; peer compiler `^1.18.0` | [registry](https://registry.npmjs.org/@typespec/http/latest) |
| `@typespec/openapi` | 1.18.0 | peer compiler/http `^1.18.0` | [registry](https://registry.npmjs.org/@typespec/openapi/latest) |
| `@typespec/openapi3` | 1.18.0 | peer compiler/http/openapi `^1.18.0` | [registry](https://registry.npmjs.org/@typespec/openapi3/latest) |
| `@typespec/rest` | 0.88.0 | **не используется**: в REST-гайде достаточно `@typespec/http` | [registry](https://registry.npmjs.org/@typespec/rest/latest), [TypeSpec: REST 01](https://typespec.io/docs/getting-started/getting-started-rest/01-setup-basic-syntax/) |
| `@hey-api/openapi-ts` | 0.99.0 | node `>=22.18.0`; bin `openapi-ts` | [registry](https://registry.npmjs.org/@hey-api/openapi-ts/latest) |
| `@redocly/cli` | 2.78.0 | node `>=22.12.0 \|\| >=20.19.0` | [registry](https://registry.npmjs.org/@redocly/cli/latest) |

Дополнительно:

- `@typespec/compiler` не имеет peer-зависимости на TypeScript (в registry `peerDependencies` пустой) — версия TS в приложениях на компилятор не влияет; TS 5.6 нужен только для сгенерированного кода.
- `@typespec/openapi3` требует `@typespec/openapi`, поэтому его нужно установить явно ([registry](https://registry.npmjs.org/@typespec/openapi3/latest)).
- `@hey-api/client-fetch` отдельным пакетом ставить не нужно: начиная с 0.73.0 он «bundled directly inside `@hey-api/openapi-ts`», а сам пакет помечен deprecated ([registry](https://registry.npmjs.org/@hey-api/client-fetch/latest)); в конфиге используется имя плагина `@hey-api/client-fetch` ([hey-api: Fetch client](https://heyapi.dev/docs/openapi/typescript/clients/fetch)).
- `@hey-api/openapi-ts` — 0.x, документация прямо просит фиксировать точную версию (`npm install @hey-api/openapi-ts -D -E`), поэтому в `package.json` пишем `"0.99.0"` без `^` ([hey-api: Get started](https://heyapi.dev/docs/openapi/typescript/get-started)).
- `package-lock.json` коммитится, в CI используется `npm ci` для проверки синхронности ([TypeSpec: Reproducibility](https://typespec.io/docs/handbook/reproducibility/)).

### Node 22 и `mise`

В репозитории `mise.toml` содержит `node = "22"`. По документации mise такой range ставит **новейший 22.x** (`mise install node@24` → newest 24.x), но может переиспользовать уже установленную подходящую версию, прежде чем искать новее ([mise: Dev tools](https://mise.jdx.dev/dev-tools/)). Практический вывод: нужен именно **22.18.0+**; чтобы не зависеть от локально закешированной старой 22.x, зафиксируйте точную версию или используйте `mise.lock` ([mise: lockfile](https://mise.jdx.dev/dev-tools/mise-lock.html)).

---

## 2. Структура контракта

`contract/` — отдельный npm workspace (добавить `"contract"` в `workspaces` корневого `package.json`), чтобы `npm install` в корне ставил и TypeSpec-зависимости, а lockfile был один.

```text
contract/
  package.json
  tspconfig.yaml
  main.tsp
  models/
    booking.tsp
    availability.tsp
  operations/
    bookings.tsp
    availability.tsp
  errors/
    common.tsp
  openapi/
    openapi.yaml        # эмитится и коммитится
frontend/
  openapi-ts.config.ts
  src/api/generated/    # gitignored
backend/
  openapi-ts.config.ts
  src/api/generated/    # gitignored, только типы
```

Почему так:

- TypeSpec-файлы можно разбивать по доменам: импорт указывается относительным путём, начинающимся с `./` или `../`, и может указывать на файл `.tsp` или на директорию с `main.tsp` ([TypeSpec: Imports](https://typespec.io/docs/language-basics/imports/)).
- Один и тот же namespace можно объявлять в нескольких файлах — «Namespaces are merged across files», поэтому модели, операции и ошибки можно держать в разных файлах, каждый из которых начинается с `namespace BookingApi;` ([TypeSpec: Namespaces](https://typespec.io/docs/language-basics/namespaces/)).
- `main.tsp` — точка входа; в нём `import "@typespec/http";`, импорты локальных файлов и `using Http;` ([TypeSpec: Getting started, REST 01](https://typespec.io/docs/getting-started/getting-started-rest/01-setup-basic-syntax/)).
- `using` локален для файла/namespace, поэтому в файлах операций нужен свой `using Http;`; для ID используйте полное имя `@TypeSpec.OpenAPI.operationId` (или `using TypeSpec.OpenAPI;`) ([TypeSpec: Namespaces, using](https://typespec.io/docs/language-basics/namespaces/)).

Пример `contract/main.tsp`:

```tsp
import "@typespec/http";
import "@typespec/openapi";

import "./models/booking.tsp";
import "./models/availability.tsp";
import "./operations/bookings.tsp";
import "./operations/availability.tsp";
import "./errors/common.tsp";

using Http;

@service(#{ title: "Booking API" })
@server("http://localhost:3000", "Local development")
namespace BookingApi;
```

Модели и валидация — обычные `model` с `@minLength`, `@minValue` и т.п. ([TypeSpec: REST 01](https://typespec.io/docs/getting-started/getting-started-rest/01-setup-basic-syntax/)). Операции — `@route` на namespace + `@get/@post/...` и union-ответы с `@statusCode`/`@body` ([TypeSpec: REST 02](https://typespec.io/docs/getting-started/getting-started-rest/02-operations-responses/)). Ошибки — модели с `@error` и явные статусы в union-ответе ([TypeSpec: REST 03](https://typespec.io/docs/getting-started/getting-started-rest/03-handling-errors/)):

```tsp
using Http;

namespace BookingApi;

@error
model NotFoundError {
  code: "not_found";
  message: string;
}

@route("/bookings")
namespace Bookings {
  @get
  @TypeSpec.OpenAPI.operationId("listBookings")
  op listBookings(): {
    @statusCode statusCode: 200;
    @body bookings: Booking[];
  };

  @get
  @TypeSpec.OpenAPI.operationId("getBooking")
  op getBooking(@path bookingId: string):
    | { @statusCode statusCode: 200; @body booking: Booking; }
    | { @statusCode statusCode: 404; @body error: NotFoundError; };
}
```

`@TypeSpec.OpenAPI.operationId` из `@typespec/openapi` задаёт стабильный `operationId` ([TypeSpec OpenAPI: decorators](https://typespec.io/docs/libraries/openapi/reference/decorators/)). Без него emitter использует стратегию `parent-container` (namespace + имя операции) ([TypeSpec: OpenAPI3 emitter options](https://typespec.io/docs/emitters/openapi3/reference/emitter/)); это тоже допустимо, но явные ID надёжнее для имён SDK-функций.

`contract/package.json` (точные версии):

```json
{
  "name": "contract",
  "private": true,
  "scripts": {
    "compile": "tsp compile . --warn-as-error",
    "watch": "tsp compile . --watch"
  },
  "dependencies": {
    "@typespec/http": "1.18.0",
    "@typespec/openapi": "1.18.0",
    "@typespec/openapi3": "1.18.0"
  },
  "devDependencies": {
    "@typespec/compiler": "1.18.0"
  }
}
```

---

## 3. Компиляция, OpenAPI и валидация

`contract/tspconfig.yaml`:

```yaml
emit:
  - "@typespec/openapi3"
output-dir: "{project-root}/openapi"
warn-as-error: true
options:
  "@typespec/openapi3":
    emitter-output-dir: "{output-dir}"
    file-type: yaml
    output-file: openapi.yaml
    openapi-versions:
      - "3.1.0"
```

Что здесь важно:

- `output-dir` и `warn-as-error` — штатные опции конфигурации TypeSpec; для `warn-as-error` есть и CLI-флаг `--warn-as-error` ([TypeSpec: Configuration](https://typespec.io/docs/handbook/configuration/configuration/)).
- `emitter-output-dir` по умолчанию равен `{output-dir}/@typespec/openapi3`; мы переопределяем его на `{output-dir}`, чтобы получить ровно `contract/openapi/openapi.yaml` ([TypeSpec: OpenAPI3 emitter options](https://typespec.io/docs/emitters/openapi3/reference/emitter/)).
- `{project-root}` указывает на папку с `tspconfig.yaml`, `{output-dir}` доступен в опциях эмиттера ([TypeSpec: Configuration, variable interpolation](https://typespec.io/docs/handbook/configuration/configuration/)).
- **Версия OpenAPI задаётся явно**: по умолчанию emitter отдаёт `["3.0.0"]`, поддерживаются `3.0.0`, `3.1.0`, `3.2.0`; мы фиксируем **3.1.0** ([TypeSpec: OpenAPI3 emitter options](https://typespec.io/docs/emitters/openapi3/reference/emitter/)). Если downstream-инструмент не умеет 3.1, замените на `3.0.0` — это единственное изменение.
- `output-file` по умолчанию для одного сервиса без версионирования — `openapi.yaml`; явное значение защищает от смены имени при добавлении версий ([TypeSpec: OpenAPI3 emitter options](https://typespec.io/docs/emitters/openapi3/reference/emitter/)).
- `file-type` по умолчанию `yaml`; YAML выбран для ревьюируемых диффов ([TypeSpec: OpenAPI3 emitter options](https://typespec.io/docs/emitters/openapi3/reference/emitter/)).

Команды:

```bash
# полная компиляция + эмит OpenAPI (из корня репо)
npm run compile -w contract
# эквивалент: (cd contract && npx tsp compile . --warn-as-error)

# быстрая проверка типов без записи файлов
npx tsp compile contract --no-emit --warn-as-error

# структурная/стилевая валидация уже эмитированного OpenAPI
npx redocly lint contract/openapi/openapi.yaml --extends=recommended
```

- `--no-emit` отключает эмиттеры и запись файлов, но компилятор продолжает проверять программу ([TypeSpec: Configuration, `--no-emit`](https://typespec.io/docs/handbook/configuration/configuration/)).
- Redocly `lint` проверяет OpenAPI-описание, по умолчанию применяет ruleset `recommended`; правило `struct` ловит нарушения структуры спецификации ([Redocly: lint](https://redocly.com/docs/cli/commands/lint)). В CI удобно добавить `--format=github-actions`, чтобы проблемы аннотировались в diff ([Redocly: lint](https://redocly.com/docs/cli/commands/lint)).
- Валидацию можно повесить на `contract`-скрипт: `tsp compile . --warn-as-error && redocly lint openapi/openapi.yaml --extends=recommended`.

Итог: единственный коммитируемый артефакт контракта — `contract/openapi/openapi.yaml` в **OpenAPI 3.1.0**.

---

## 4. `@hey-api/openapi-ts`: клиент, типы, сервисы

### 4.1. Фронтенд (клиент + SDK + типы)

`frontend/openapi-ts.config.ts`:

```ts
export default {
  input: '../contract/openapi/openapi.yaml',
  output: {
    path: 'src/api/generated',
    clean: true,
  },
  plugins: [
    '@hey-api/client-fetch',
    '@hey-api/sdk',
    '@hey-api/typescript',
  ],
};
```

`frontend/package.json`:

```json
{
  "scripts": {
    "generate": "openapi-ts"
  },
  "devDependencies": {
    "@hey-api/openapi-ts": "0.99.0"
  }
}
```

Что получится:

- `client.gen.ts` + каталоги `client/`, `core/` — runtime Fetch-клиента; Fetch является клиентом по умолчанию ([hey-api: Fetch client](https://heyapi.dev/docs/openapi/typescript/clients/fetch)).
- `sdk.gen.ts` — типизированные функции на каждую операцию (`@hey-api/sdk`) ([hey-api: SDK plugin](https://heyapi.dev/docs/openapi/typescript/plugins/sdk)).
- `types.gen.ts` — интерфейсы и алиасы `<Op>Data`, `<Op>Responses`, `<Op>Response`; этот файл «does not impact your bundle size» и удаляется при сборке ([hey-api: TypeScript plugin](https://heyapi.dev/docs/openapi/typescript/plugins/typescript)).
- index-файл — точка входа; по умолчанию ко всем именам файлов добавляется суффикс `.gen` ([hey-api: Output](https://heyapi.dev/docs/openapi/typescript/configuration/output)).
- Каталог `output.path` очищается при каждом запуске (`clean`), поэтому генерируйте в выделенную папку и не кладите туда ручной код ([hey-api: Output](https://heyapi.dev/docs/openapi/typescript/configuration/output)).
- В каждом файле есть заголовок о том, что изменения будут потеряны при регенерации ([hey-api: Output](https://heyapi.dev/docs/openapi/typescript/configuration/output)).

Использование во фронтенде:

```ts
import { client } from './api/generated/client.gen';
import { listBookings } from './api/generated/sdk.gen';

client.setConfig({ baseUrl: import.meta.env.VITE_API_URL ?? 'http://localhost:3000' });

const { data } = await listBookings();
```

`setConfig` — штатный способ задать `baseUrl` и `auth` для Fetch-клиента ([hey-api: Fetch client](https://heyapi.dev/docs/openapi/typescript/clients/fetch)).

### 4.2. Бэкенд (только типы, без импорта фронтенда)

`backend/openapi-ts.config.ts`:

```ts
export default {
  input: '../contract/openapi/openapi.yaml',
  output: {
    path: 'src/api/generated',
    clean: true,
    module: { extension: '.js' },
  },
  plugins: ['@hey-api/typescript'],
};
```

`backend/package.json`:

```json
{
  "scripts": {
    "generate": "openapi-ts"
  },
  "devDependencies": {
    "@hey-api/openapi-ts": "0.99.0"
  }
}
```

Ключевые моменты:

- Плагин `@hey-api/typescript` без клиента/SDK даёт только `types.gen.ts` (+ `index.ts`), без runtime-кода ([hey-api: TypeScript plugin](https://heyapi.dev/docs/openapi/typescript/plugins/typescript)).
- `output.module.extension: '.js'` заставляет генератор писать fully specified импорты (`./types.gen.js`), что нужно для Node ESM / `moduleResolution: NodeNext` ([hey-api: Output, Module Extension](https://heyapi.dev/docs/openapi/typescript/configuration/output)). У бэкенда в `tsconfig.json` как раз `module/moduleResolution: NodeNext` и `rootDir: ./src` (`backend/tsconfig.json`).
- Файл лежит внутри `backend/src/`, поэтому `rootDir` не нарушается, а `tsc` собирает его в `dist/` вместе с остальным кодом.
- Бэкенд импортирует типы только из своего сгенерированного файла:

```ts
import type {
  CreateBookingData,
  CreateBookingResponses,
} from './api/generated/types.gen.js';

app.post<{ Body: CreateBookingData['body'] }>('/bookings', async (request, reply) => {
  const booking: CreateBookingResponses[201] = /* ... */;
  return reply.code(201).send(booking);
});
```

Имена `<Op>Data` / `<Op>Responses` — публичный контракт плагина ([hey-api: TypeScript plugin](https://heyapi.dev/docs/openapi/typescript/plugins/typescript)); ошибки из `@error`-union попадают в `<Op>Errors` (см. пример `AddPetErrors` в [hey-api: SDK plugin](https://heyapi.dev/docs/openapi/typescript/plugins/sdk)).

**Почему не общий пакет с типами?** Вариант «сгенерировать один раз в `packages/api-client` и импортировать в оба приложения» тоже рабочий, но требует либо собирать пакет в JS/d.ts и выстраивать порядок сборки, либо настраивать project references. Для текущего репозитория с двумя workspace'ами и `rootDir: ./src` две генерации из одного YAML проще и не создают cross-package coupling. Бэкенд при этом не импортирует ни `frontend/`, ни его сгенерированные файлы.

---

## 5. Где хранить артефакты, что коммитить и как ловить drift в CI

### Раскладка

| Путь | Коммитить | Почему |
| --- | --- | --- |
| `contract/**/*.tsp`, `contract/tspconfig.yaml`, `contract/package.json` | **Да** | Это исходник контракта |
| `contract/openapi/openapi.yaml` | **Да** | Ревьюируемый снимок контракта; по нему видно изменение API в PR |
| `frontend/src/api/generated/**` | **Нет** | Детерминированный build-артефакт; gitignore |
| `backend/src/api/generated/**` | **Нет** | То же; типы воспроизводятся из YAML |
| `contract/openapi/` (каталог) | **Да** | Эмитится `tsp compile`, не удаляется вручную |

В `.gitignore` добавить:

```gitignore
frontend/src/api/generated/
backend/src/api/generated/
```

В `biome.json` (сейчас Biome 1.9.4, секция `files.ignore` — `biome.json`) добавить те же каталоги, иначе `npx biome check .` будет форматировать/линтить сгенерированный код:

```json
"files": {
  "ignore": ["node_modules", "dist", ".github", "frontend/src/api/generated", "backend/src/api/generated"]
}
```

### Почему не коммитить сгенерированный TS

- OpenAPI уже коммитится и является ревьюируемым контрактом; TS полностью детерминирован из него при зафиксированных версиях и lockfile.
- Две копии типов (frontend + backend) в git дают шумные диффы и конфликты, не добавляя информации.
- Заголовок hey-api прямо предупреждает, что файлы перезаписываются ([hey-api: Output](https://heyapi.dev/docs/openapi/typescript/configuration/output)).

Альтернатива, если команда хочет «клонировал → сразу typecheck без codegen»: коммитить и TS, а в CI диффить все три пути. Тогда цена — шумные диффы и необходимость дисциплины «не редактировать руками». Для этого репозитория рекомендуем первый вариант.

### Пайплайн в `mise run check`

Существующий CI: `jdx/mise-action@v2` → `mise run install` → `mise run check` (`.github/workflows/ci.yml`), а `check` сейчас = Biome + typecheck + build + test (`mise.toml`). Добавить перед typecheck/build:

```bash
npm run compile -w contract
npx redocly lint contract/openapi/openapi.yaml --extends=recommended --format=github-actions
npm run generate -w backend
npm run generate -w frontend
git diff --exit-code -- contract/openapi
```

- `git diff --exit-code` завершится с кодом `1`, если есть различия, и `0`, если их нет — это и есть drift-check ([git-diff](https://git-scm.com/docs/git-diff)).
- Почему это ловит рассинхрон: если кто-то изменил `.tsp`, но не закоммитил перегенерированный `openapi.yaml`, CI после `tsp compile` увидит diff и упадёт. Если кто-то вручную правил `openapi.yaml`, компиляция перезапишет его — diff снова упадёт.
- Сгенерированный TS не коммитится, поэтому его не нужно диффить: CI всегда генерирует его заново перед `typecheck`/`build`. Локально `mise run dev` и `mise run check` должны зависеть от `generate`, иначе свежий клон не соберётся.
- `npm ci` в CI гарантирует, что `package.json` и `package-lock.json` синхронны ([TypeSpec: Reproducibility](https://typespec.io/docs/handbook/reproducibility/)).

Порядок в `check` важен: сначала compile (обновляет OpenAPI), затем lint, затем генерация TS, затем typecheck/build/test, и только потом `git diff` (или diff сразу после compile — до генерации TS, чтобы не тянуть лишнее).

---

## 6. Рекомендация

1. **Добавить `contract` в `workspaces`** корневого `package.json`; зафиксировать точные версии `@typespec/compiler@1.18.0`, `@typespec/http@1.18.0`, `@typespec/openapi@1.18.0`, `@typespec/openapi3@1.18.0`; коммитить `package-lock.json`.
2. **Разложить контракт по файлам**: `main.tsp` + `models/` + `operations/` + `errors/`, один `namespace BookingApi;` (namespace'ы мержатся между файлами); явные `@operationId` для операций.
3. **Эмитить OpenAPI 3.1.0** в `contract/openapi/openapi.yaml` через `tspconfig.yaml` (см. §3), с `warn-as-error: true`.
4. **Валидировать** `tsp compile --warn-as-error` + `redocly lint --extends=recommended`; добавить `@redocly/cli@2.78.0` в корневые devDependencies, в CI использовать `--format=github-actions`.
5. **Генерировать дважды**: frontend — `@hey-api/client-fetch` + `@hey-api/sdk` + `@hey-api/typescript`; backend — только `@hey-api/typescript` с `module.extension: '.js'`. Оба конфига читают один и тот же `contract/openapi/openapi.yaml`.
6. **Коммитить только OpenAPI** (и исходники контракта); сгенерированный TS — в `.gitignore` и в `biome.json` ignore.
7. **Встроить генерацию в `mise run check`/`dev`** и добавить `git diff --exit-code -- contract/openapi` как drift-check.
8. **Поднять Node до ≥ 22.18.0** и зафиксировать это (точная версия в `mise.toml` или `mise.lock`), потому что `node = "22"` может переиспользовать старую установленную 22.x.

---

## 7. Открытые вопросы и риски

- **Node 22.18.0 vs `mise.toml`**: range `22` не гарантирует минимум 22.18.0, если локально уже стоит более старая 22.x; нужен `mise.lock` или точный pin. Проверить в CI `node -v`.
- **OpenAPI 3.1 vs 3.0**: 3.1.0 выбран осознанно; если появится потребитель, не поддерживающий 3.1, переключение на 3.0.0 — одна строка в `tspconfig.yaml`. `@hey-api/openapi-ts` принимает все валидные версии OpenAPI ([hey-api: Configuration](https://heyapi.dev/docs/openapi/typescript/configuration)).
- **Версионирование API**: при добавлении `@typespec/versioning` дефолтное имя файла начнёт включать версию; явный `output-file: openapi.yaml` этого не учитывает. Тогда понадобится `output-file: "openapi.{version}.yaml"` ([TypeSpec: OpenAPI3 emitter options](https://typespec.io/docs/emitters/openapi3/reference/emitter/)).
- **Runtime-валидация на бэкенде**: сейчас бэкенд получает только TS-типы; JSON Schema для Fastify не генерируется. Если нужна валидация запросов на сервере, это отдельное решение (генерировать JSON Schema/Zod/Valibot или описывать Fastify-схемы вручную). Не входит в этот тикет.
- **Ошибки**: `@error` + union-ответы дают типы, но не выбирают формат (например, RFC 9457 problem details). Это вопрос дизайна контракта, не пайплайна.
- **Коммитить ли TS**: выбран вариант «не коммитить». Если позже понадобится работать без codegen сразу после клона, можно перейти на коммит TS + diff всех сгенерированных путей; это осознанный trade-off, а не ошибка.
- **Biome 1.9.4**: используется устаревшая схема `files.ignore`; при обновлении до Biome 2 её нужно переписать на `files.includes` с negative patterns. На пайплайн не влияет, но учесть при апгрейде.
- **`@typespec/rest`**: не используется; для CRUD достаточно `@typespec/http`. Если понадобятся resource-oriented паттерны (Azure-стиль), это отдельное решение и отдельная зависимость 0.88.0.
- **Смена версии hey-api**: 0.x, возможны breaking changes в именах плагинов/опций; поэтому точная версия и lockfile обязательны ([hey-api: Get started](https://heyapi.dev/docs/openapi/typescript/get-started)).

---

## Источники

TypeSpec:

- https://typespec.io/docs/ — установка, Node.js 22.0.0+, `tsp init` / `tsp compile`
- https://typespec.io/docs/getting-started/getting-started-rest/01-setup-basic-syntax/
- https://typespec.io/docs/getting-started/getting-started-rest/02-operations-responses/
- https://typespec.io/docs/getting-started/getting-started-rest/03-handling-errors/
- https://typespec.io/docs/language-basics/imports/
- https://typespec.io/docs/language-basics/namespaces/
- https://typespec.io/docs/libraries/openapi/reference/decorators/ — `@operationId`
- https://typespec.io/docs/handbook/configuration/configuration/ — `output-dir`, `warn-as-error`, `--no-emit`, интерполяция
- https://typespec.io/docs/handbook/reproducibility/ — lockfile, `npm ci`
- https://typespec.io/docs/emitters/openapi3/reference/emitter/ — `openapi-versions`, `output-file`, `emitter-output-dir`, `operation-id-strategy`

Hey API:

- https://heyapi.dev/docs/openapi/typescript/get-started — установка, pin exact version, `openapi-ts.config.ts`
- https://heyapi.dev/docs/openapi/typescript/configuration — все валидные версии/форматы OpenAPI
- https://heyapi.dev/docs/openapi/typescript/configuration/output — `.gen` suffix, `module.extension`, `clean`, заголовок
- https://heyapi.dev/docs/openapi/typescript/clients/fetch — Fetch по умолчанию, `setConfig`
- https://heyapi.dev/docs/openapi/typescript/plugins/typescript — `types.gen.ts`, `<Op>Data`/`<Op>Responses`
- https://heyapi.dev/docs/openapi/typescript/plugins/sdk — `sdk.gen.ts`, `<Op>Errors`

NPM registry:

- https://registry.npmjs.org/@typespec/compiler/latest
- https://registry.npmjs.org/@typespec/http/latest
- https://registry.npmjs.org/@typespec/openapi/latest
- https://registry.npmjs.org/@typespec/openapi3/latest
- https://registry.npmjs.org/@typespec/rest/latest
- https://registry.npmjs.org/@hey-api/openapi-ts/latest
- https://registry.npmjs.org/@hey-api/client-fetch/latest
- https://registry.npmjs.org/@redocly/cli/latest

Прочее:

- https://redocly.com/docs/cli/commands/lint — `lint`, ruleset `recommended`, `--format=github-actions`
- https://git-scm.com/docs/git-diff — `--exit-code` (1 при различиях)
- https://mise.jdx.dev/dev-tools/ — range `22` → newest 22.x, переиспользование установленных версий
- https://mise.jdx.dev/dev-tools/mise-lock.html — фиксация версии

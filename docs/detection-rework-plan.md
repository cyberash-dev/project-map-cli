# Rework детекции endpoints/interactions (план реализации, фазы A–F)

Статус: утверждён. Источник правды по требованиям —
`intraservice-map/docs/project-map-detection-rework.md` **v4.1**; этот файл описывает
только _как_ реализация ложится на текущий код `project-map-cli`.

Прогресс: правки спеки до v4.1 внесены. Фаза A не начата (продакшн-кода нет).

## Контекст

Секции `endpoints` и `interactions` в `project-map` выключены в реальных сервисах
из-за ложных срабатываний: детекция построена на именах, а не на структуре.
Конкретно в `midas` (Go) экстрактор принимает `r.Header.Get(...)` за роут — 811
вызовов `.Get(`, из которых роутов лишь ~27; `AGENTS.md` сервиса прямо фиксирует
это как причину отключения. В `yandex_pay_plus` (Python) `interactions` требует
`interactions.dir` и распознаёт лишь первый класс `*Client` на каталог, теряя
почти всё, а `usedBy` вообще никогда не заполняется.

Спецификация `/Users/cyberash/Projects/intraservice-map/docs/project-map-detection-rework.md`
(v4) заменяет это на структурную детекцию с провенансом импортов, честным
`unknown` вместо догадок и байт-стабильным артефактом фактов, пригодным для
кросс-репозиторного джойна отдельным инструментом (linker). Цель этой работы —
реализовать §15 MVP спеки в `project-map-cli` и подтвердить результат на двух
сервисах: `~/arcadia-volumes/artel/trust/midas` (Go/chi) и
`~/arcadia-volumes/artel/billing/yandex_pay_plus` (Python/aiohttp+sendr).

**Принятые решения:** объём — фазы A–F (полный MVP §15 без `--strict` baseline и
без выпила legacy-слайсов); раскатка — новые opt-in секции + отдельный
`facts.json`, старые `endpoints`/`interactions` не трогаем; спека обновляется до
v4.1; отложены queue (§5.3), Swagger 2.0 (§12), `openapi.consumes` (§5.2.1),
per-call-site маркер (§4.3).

---

## Разведка: что реально в сервисах (это оракул, а не гипотезы)

**midas (Go, chi):**

- 5 закоммиченных спек OpenAPI **3.1** в `openapi/`; `servers[0].url` (`/v2`,
  `/pay/v1`, …) точно совпадает с префиксом `r.Mount(...)` в коде. Swagger 2.0 и
  `basePath` отсутствуют.
- oapi-codegen вызывается из Arcadia `ya.make` макросом `GO_OAPI_CODEGEN`, и
  **сгенерированные `.go` в дерево не попадают**. Значит нет ни `ServerInterface`,
  ни комментариев `// (GET /path)`, ни таблицы регистрации. Handler-линковка —
  только через `var _ generated.ServerInterface = &V2Api{}` + `operationId` ↔ имя
  Go-метода, иначе честный `handler: unknown`.
- Роуты только в `internal/api/router.go` (94 регистрации + 7 `Mount`) и
  `internal/metrics/router.go` (2). Композиция — по **идентичности значения**:
  `v1Router := chi.NewRouter()` → `b.withStats(v1Router).With(mw...)` →
  `.Post("/x", h)` → `r.Mount("/v1", v1Router)`. Имена получателей произвольные
  (`v1MethodsRouterStatsUntagged`), тип у всех один (`chi.Router`).
- 94 pay-роута зарегистрированы внутри `r.Group(func(r chi.Router){ ... })` (`r`
  затенён) как `r.Post(options.BaseURL+"/path", wrapper.X)` — путь это BinaryExpr,
  `options.BaseURL` доказуемо `""`.
- `/ping` — не роут, а short-circuit в middleware.
- Outbound: ни одного `http.NewRequest`+`Do` в проде. Своя обвязка над resty:
  `req := interactions.NewRequest().WithContext(ctx); req.APIMethod = "/api/v1/x";
req.Method = interactions.HTTPGet; c.MakeRequestWithError(req, ...)` — 137 мест.
  Метод по умолчанию GET из конструктора. База: `MakeURL(cfg.BaseURL, req.APIMethod)`,
  `cfg` — поле Go-структуры с тегом `yaml:"atlas"` → ключ `atlas.base_url` в
  `package/etc/payments-sdk-backend/production.yaml` (46 ключей).
- Оракул истины уже есть: `scripts/route_coverage/main.go` обходит живой роутер
  через `chi.Walk`.

**yandex_pay_plus (Python, aiohttp + sendr):**

- **Спеки OpenAPI в репозитории нет** — `api/swagger.py` генерирует её в рантайме
  из apispec+marshmallow. Inbound целиком из кода.
- DSL: `sendr_aiohttp.Url(path, handler, name=, method='*')` и
  `PrefixedUrl` с `PREFIX: ClassVar[str]`. 12 модулей `api/routes/*.py`, 220
  деклараций. Каждый модуль объявляет **свой локальный** `class Url(PrefixedUrl):
PREFIX = '/api/merchant'`. `routes/public.py` мешает префиксный `Url` и
  алиасный `PureUrl` в одном кортеже; `routes/utility.py` — голый `Url` без
  префикса; `routes/cms.py` делает сплат `(*RETAIL_CRM_ROUTES, Url(...))`.
- `method='*'` не переопределяется нигде. Глагол определяется тем, какие
  `async def get/post/...` есть у класса-хендлера — **включая унаследованные**:
  `GetNFCInstallRewardHandler` не объявляет ни одного и наследует `post` от
  абстрактной базы. Нужен обход иерархии между файлами.
- Пути с aiohttp-регекспом `{order_id:[^/]+}` → канонизировать в позиционную дыру.
- 6 подклассов `web.Application` компонуют разные наборы `_urls`; `combined_app.py`
  делает `YandexPayPlusPublicApplication._urls + (INTERNAL_ROUTES, ...)`.
- Outbound: база `sendr_interactions.AbstractInteractionClient` с `BASE_URL:
ClassVar[str]` и членами `async def get/post/put/patch/delete(self,
interaction_method: str, url: str, **kw)`. **Обязательный первый kwarg
  `interaction_method=` — то, что отличает вызов от любого `dict.get()`.**
- 81 локальный класс-клиент, 47 объявлений `BASE_URL = settings.<NAME>`. `settings/`
  — это Python-исходники `.conf` с per-env вариантами (`.conf.production`, `.testing`).
- Реестр: `class InteractionClients: saturn: SaturnClient` — **голые аннотации**
  уровня класса (49 шт.), метакласс читает их через `get_type_hints`. Env-варианты
  (`InteractionClientsTesting`/`Sandbox`) переаннотируют тот же атрибут другим
  классом. 264 места вызова `await self.clients.<attr>.<method>(...)`.
- 44 из 60 пакетов взаимодействий — тонкие подклассы
  `pay.lib.interactions.<svc>.client.Abstract<X>Client`, тела методов вне сервиса.
  Это ровно кейс §5.2B (shared-library половинки).
- Очередей нет: `taskq` — это БД-очередь по enum `WorkerType`, не wire-топик.

---

## Правки спеки до v4.1 (делаем первыми, до кода)

Файл: `/Users/cyberash/Projects/intraservice-map/docs/project-map-detection-rework.md`.
Три аддитивные, структурные (без name-эвристик) правки — иначе спека теряет
большую часть реального оракула.

**1. §5.2A — лестница привязки `target` вместо «всегда из конструкции инстанса».**
Буквальное чтение даёт `destination: unknown` для всех 49 клиентов pay_plus:
`BASE_URL` там — class-const локального типа, а инстанс строится метаклассом и
статически неразрешим. Новая нормативная лестница, первый применимый шаг
побеждает, выбранный шаг пишется в `destination.binding ∈ {instance,
owner_construction, owner_declaration}` как **evidence** (в прообраз fact-id не
входит, ядро не расщепляет):

1. `instance` — получатель разрешается def-use до конструкции внутри
   `analysis_unit`. Без изменений; именно это сохраняет гейт §16 «два инстанса
   одного типа с разными конфиг-ключами → два destination».
2. `owner_construction` — применим, только если получатель это `self`/`this`/
   Go-receiver. Идентичность инстанса = объемлющий тип `T` (доказан по §3, не по
   имени). Собираем **все конструкции `T` внутри unit** (композитный литерал,
   `new(T)`, вызов класса, либо вызов функции с объявленным возвращаемым типом
   `T`/`*T`, чьё тело возвращает такую конструкцию в пределах бюджета 3) и
   комбинируем как коррелированные варианты §7.3.
3. `owner_declaration` — применим, только если шаг 2 не дал ничего, **и** якорь
   декларации `T` (или предка `T` в локально доказанной иерархии) находится
   **внутри `analysis_unit`**. Селектор (`field`/`class_const`) применяется к этой
   декларации; побеждает самый производный предок, связывающий селектор; две
   привязки в одном классе → `selector_unresolved`.
4. Иначе `unknown{reason}`: `cross_boundary` (декларация вне unit),
   `open_world_dispatch`, `depth_exceeded`.

Намерение §1 сохранено: шаг 3 читает только **декларацию, которая есть в unit**, и
только через объявленный селектор — никогда тело операции и никогда за границей
репозитория. Клиент из shared-lib, у которого `BASE_URL` вне unit, по-прежнему
падает на шаг 4 / `operation_in_library_root`, то есть §5.2B не меняется.

**2. §4.2 — цепочки селекторов + привязка `method` + `call[]` как объекты.**
`Selector = SelectorStep | SelectorStep[]`, где `SelectorStep` — прежнее закрытое
множество `{arg | field | class_const | receiver | property-path}`. Шаг _i+1_
применяется к **нормализованному §5A значению** шага _i_, а не к его AST-узлу.
Односложная форма — сахар для цепочки из одного шага, так что все примеры §4.2
остаются валидны дословно. Глобы/регекспы по-прежнему config-time reject.

```yaml
path_arg: [{ kind: arg, selector: 0 }, { kind: field, selector: "APIMethod" }]
method: [{ kind: arg, selector: 0 }, { kind: field, selector: "Method" }]
```

Плюс два добора: `method: <SelectorChain> | {from: member}` (в §4.2 привязки метода
не было вовсе, а §7.2 поле требует; дефолт `{from: member}` — то, что нужно
pay_plus), и `call[]` становится массивом объектов, чтобы один член мог
переопределить общие привязки (`MakeRequestWithRawResponseAndBaseUrl` берёт базу
из `arg 2`).

**3. §5.1 — объявляемые identity-preserving члены роутера.**
Буквальное «роутер, прошедший через хелпер, деградирует до `unresolved`» теряет
все 94 pay-роута midas, потому что там `BaseRouter: b.withStats(payV1Router)`.
Добавляем декларацию (необъявленный хелпер по-прежнему деградирует, гарантия §5.1
цела — для этого §4.2 и существует):

```yaml
detect:
  inbound:
    routers:
      - dsl: "github.com/go-chi/chi/v5.Router"
        identity_preserving:
          - { member: "With", from: receiver }
          - { member: "Group", from: receiver, binds: closure_arg0_param0 }
          - { member: "routerBuilder.withStats", from: arg, index: 0 }
          - { member: "routerBuilder.withUntaggedStats", from: arg, index: 0 }
```

`binds: closure_arg0_param0` — идентичность утекает в первый параметр функции-литерала
первого аргумента, ровно как в `r.Group(func(r chi.Router){ r.Post(...) })`.

Заодно в v4.1 фиксируем отложенное: §5.3 queue, Swagger 2.0 в §12, §5.2.1
`openapi.consumes`, §4.3 маркер — как «deferred, нет оракула», а не как молча
нереализованное.

---

## Архитектурные решения

**Новая фича `src/features/detect/`, а не слайс внутри `build`.** Три жёсткие
причины: (1) `ExtractionContext` несёт `projectRoot`, `reader`, `parser` — живую
ФС и абсолютный путь, что §3 детектору запрещает, а очистить его нельзя, не сломав
пять других слайсов; (2) `BuildDeps` уже 8 свойств из 10 по линту, а нужны ещё
`IOpenApiReader`, `IConfigKeyDeclarationResolver`, материализатор и канонизатор;
(3) у артефактов разные контракты — markdown несёт таймстамп и сравнивается modulo
metadata, facts.json таймстампа не несёт и сравнивается побайтово.

Композиция в `src/cli/commands.ts` (единственное место, трогающее ФС):

```
materializeAnalysisUnit(cwd, config)   → AnalysisUnit   (нечистое, граница)
DetectFactsUseCase.execute(unit)       → FactSet        (ЧИСТОЕ)
BuildProjectMapUseCase.execute(cwd, sources?) → ProjectMap
renderMarkdown(map, config, factSet)   → PROJECT_MAP.md
renderFactsArtifact(factSet)           → .project-map/facts.json
```

`BuildProjectMapUseCase.execute` получает **необязательный** второй параметр
`sources?: MaterializedSources`; когда он передан — свой `walk`+`parseAll`
пропускается. Нулевой прирост зависимостей, нет двойного парсинга, текущее
поведение при отсутствии параметра неизменно.

**Три файла вывода, ноль поломок для текущих потребителей:**

| Файл                                                            | Контракт                                                                                                  |
| --------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `PROJECT_MAP.md`                                                | Без изменений; `stripMetadata` в `commands.ts:325` остаётся как есть                                      |
| `.project-map/facts.json` (новый `output.facts`, дефолт `null`) | Верифицируемый артефакт §13; `--check` сравнивает побайтово **только если `output.facts` задан**          |
| `.project-map/facts.meta.json`                                  | Сайдкар: таймстамп, длительность, отчёт `--strict`; `--check` игнорирует, `init` добавляет в `.gitignore` |

Новые секции — **opt-in id** `inbound_endpoints`, `outbound_operations`,
`detection_coverage`. Это требует разделить `SECTION_IDS` (порядок рендера) и
`DEFAULT_SECTION_IDS` (дефолт zod-схемы, без новых id) в
`src/core/domain/project-map.ts` — иначе каждое существующее репо молча получит
новые секции. Старые `endpoints`/`interactions` живут рядом, что даёт A/B на одном
репозитории.

**Коды выхода** (расширяют текущие 1/2): `0` ок · `1` дрейф артефакта/markdown ·
`2` конфиг не найден · `3` несовпадение `analyzer_build_digest` · `4` обязательная
check-диагностика (`selector_unresolved`, `marker_invalid`) · `5` config-time
ошибка (`spec_locator_outside_repo`, `monorepo_root_unresolved`, невалидный
селектор), поднимается **до** любой сборки. Отдельный код 3 нужен потому, что
дайджест лежит **внутри** сравниваемых байт (§13), значит каждый релиз детектора
инвалидирует закоммиченный `facts.json` у всех — CI должен отличать «анализатор
поехал, перегенерируй» от «твой код поехал».

**Якоря UTF-8 — обязательны с первого дня, проверено вручную.** `node.startIndex`
у tree-sitter — индекс в кодовых единицах **UTF-16**, а §7.4/§13 требуют байтовые
смещения UTF-8; оба сервиса полны кириллицы в комментариях. Проверка:

```
utf16 len 35  utf8 len 46
node var_declaration  startIndex 25  endIndex 34
utf16 slice: "var x = 1"     utf8 slice: "тари�"
```

Якоря входят в прообраз fact-id каждого нерезолвнутого факта и каждого
`call_site`, так что ретрофит позже обнулит все golden-фикстуры.

**Границы unit ≠ scan root.** Оба сервиса ставят `root:` в подкаталог (`internal`,
`yandex_pay_plus`), а спеки midas лежат в `openapi/` — сиблинге `internal`. Значит
`repo:`-локаторы §3 якорятся к `path.dirname(config.sourcePath)`, а не к
`config.root`; `config.root` продолжает управлять только отбором исходников.

**Оба сервиса требуют правок своего `.project-map.yaml` до того, как детекция
заработает** — это блокер фаз C/E, который выглядит как баг детектора:

- pay_plus исключает `**/base.py` → `interactions/base.py` вне unit → цепочка
  `BaseInteractionClient` → `AbstractInteractionClient` рвётся → **ни один sink не
  матчится**; и исключает `settings/**`, где все 47 целей `BASE_URL`.
- midas с `root: internal` оставляет `openapi/` и `package/etc/**/*.yaml` вне unit.

Решение — отдельный блок `analysis_unit:` со своими `sources.include/exclude` и
списком `config_declarations:`, развязанный с `exclude:`, настроенным под entities.
Конфиг-документы попадают в unit, **не** попадая в сканируемый набор исходников.

**`repository_identity` не делаем безусловно обязательным** (§17 говорит
required, но это ломает корневой конфиг самого репозитория и все 4 фикстуры в
первый же день). Zod `superRefine`: обязателен **тогда и только тогда**, когда
задан `output.facts` либо присутствует `openapi:`/`detect:`.

**Попутно чиним `hashConfig`.** `src/infrastructure/config/loader.ts:169` делает
`JSON.stringify(raw, Object.keys(raw).sort())` — массив-replacer применяется на
**каждом** уровне вложенности, поэтому все вложенные объекты сериализуются как
`{}` и `configHash` слеп почти ко всему конфигу. После появления `jcs.ts` это
двухстрочная правка `sha256(jcs(raw))`. Она **изменит `configHash` во всех
закоммиченных `PROJECT_MAP.md`** — сажаем отдельным осознанным коммитом в фазе A.

---

## Раскладка модулей

```
src/core/domain/facts/{fact.ts, value-ir.ts, anchor.ts, diagnostic.ts, resolution.ts}
src/core/ports/{analysis-unit.port.ts, openapi.port.ts, config-keys.port.ts}
src/features/detect/
  detect.use-case.ts                 DetectFactsUseCase (чистый)
  detection-context.ts               AnalysisUnit + DetectionContext
  canonical/{jcs.ts, array-order.ts, fact-id.ts, build-digest.ts}
  index/{anchors.ts, import-index/<lang>.ts, declaration-index/<lang>.ts, hierarchy.ts}
  value/{ir.ts, lattice.ts, record.ts, budget.ts, engine.ts, fold/<lang>.ts}
  openapi/{ingest.ts, refs.ts, path-grammar.ts, compose.ts}
  merge/{core.ts, merge-table.ts, resolution.ts, diagnostics.ts}
  inbound/{ladder.ts, adapters/<lang>/*.ts}
  outbound/{ladder.ts, adapters/<lang>/*.ts, sinks.ts, target-binding.ts}
  registry/{adapters.ts, registry-digest.ts, selector-schema.ts}
  render/{artifact.ts, sidecar.ts, markdown-sections.ts}
src/infrastructure/analysis-unit/materializer.ts
src/infrastructure/openapi/yaml-openapi-reader.ts
src/infrastructure/config-keys/{python-settings.ts, go-struct-yaml.ts}
scripts/emit-build-digest.mjs
```

`src/features/build/symbol-index.ts` замещается индексами `index/*` (его
`importsByFile` выбрасывает module specifier, Go не собирает ничего, `defs` не
читается никем) — но удаляем его только в фазе G, пока им пользуются legacy-слайсы.

**RFC 8785 JCS пишем сами, без зависимости — и это осознанный вывод, а не лень:**
сортировка ключей по UTF-16 code unit — это ровно `Array.prototype.sort()`; формат
чисел JCS — это алгоритм `Number::toString`, то есть дословно `String(n)` (включая
порог `1e+21`), нужны лишь два стража (`-0 → "0"`, отказ на non-finite); экранирование
строк JCS совпадает с `JSON.stringify` для строки. Итого ~70 строк рекурсивного
сериализатора над **закрытым** union `CanonicalValue` (без `undefined`, `Date`,
`bigint`) — критично при `exactOptionalPropertyTypes`: опциональное поле со
значением `undefined` должно **отбрасываться** на границе схемы, а не сериализоваться.

`detector_source_digest` — сгенерированная на сборке константа: `scripts/emit-build-digest.mjs`
в `npm run build` пишет `src/features/detect/registry/build-digest.generated.ts` =
sha256 по отсортированным `(path, bytes)` из `src/features/detect/**` и
`src/core/domain/facts/**`. Детерминированно, машинонезависимо, без чтения `dist/`.

**Как удержаться в лимитах линта** (350 строк/файл, 80 строк/функция, 7 параметров,
10 методов и 10 свойств/класс, без `any`, без `!`, без сужающего `as`, без `//`):

- Свободные функции вместо классов: лимит на 10 методов бьёт только по классам.
  Правило — не более одного класса на модуль, ≤4 метода, вся логика в модульных
  функциях. Это уже идиома репозитория.
- Нормализатор режем **заранее**, а не после упора в 350:
  `value/ir.ts` (~120) · `lattice.ts` (~180) · `record.ts` (~150) · `budget.ts` (~180) ·
  `fold/{python,go,typescript}.ts` (~200 каждый) · `engine.ts` (~200).
- `budget.ts` — **явный worklist, не рекурсия**. §5A требует обхода по
  **минимальной** межпроцедурной дистанции с дедупликацией состояний,
  достигнутых длинным (diamond) путём — это буквально BFS с `Map<stateKey, minDepth>`.
  Рекурсия дала бы DFS-порядок, то есть неверный frontier, плюс риск стека. Это
  и есть несущее свойство детерминизма: на глубине 3 исходящее contributing-ребро
  в состояние, не доказанное в пределах 3, даёт `unknown(depth_exceeded)`
  **независимо от порядка обхода**.
- Объектные параметры вместо позиционных: точка входа естественно хочет
  `(unit, index, file, node, env, budget, adapters)` — ровно 7. Один
  `NormalizeRequest`.
- Никаких switch по 12 кодам `reason` — таблицы `Record<ReasonCode, string>`
  (`requireDefaultForNonUnion` делает широкие switch болезненными). Исчерпывающий
  switch оставляем на 6-членном union `ValueIr['kind']` — там правило полезно.
- `noUncheckedIndexedAccess` + позиционные селекторы: добавить
  `at<T>(arr, i): T | null` в `src/infrastructure/parser/ts-utils.ts` и применять
  единообразно (`!` запрещён, а `?? ""` молча выдумывает значение).
- `id-denylist` бьёт прямо по словарю нормализатора: заранее фиксируем
  `valueIr`, `resolved`, `outcome`, `folded`, `state`, `binding` — никогда `val`/`res`.
- Заранее режем и три других кандидата на упор: Go-адаптер chi, `openapi/ingest.ts`,
  `merge/` — каждому `index.ts` + 3–5 сиблингов с первого дня.
- Сужающий `as` запрещён, а схема фактов — discriminated union: пишем предикаты
  `isLiteralIr(v): v is LiteralIr`.

**Тесты.** `vitest.config.ts` уже включает `tests/**/*.test.ts`, поэтому
`tests/unit/**` и `tests/golden/**` не требуют правок конфига. Golden-раннер:
`tests/golden/<case>/{input/, expected.json}`, один обходчик
`tests/golden/golden.test.ts` (~80 строк) с `UPDATE_GOLDEN=1` для перезаписи.

---

## Фазы

### Фаза A — ядро детерминизма + граница `analysis_unit` (~900 src / 600 тестов)

Строим: `core/domain/facts/*` (схема фактов, `ValueIr`, `SourceAnchor`,
`Diagnostic`, `Resolution`, закрытый enum `reason`) · `canonical/{jcs, array-order,
fact-id, build-digest}.ts` · `index/anchors.ts` (таблица префиксных сумм UTF-16→UTF-8,
одна O(n) прогонка на файл) · `core/ports/analysis-unit.port.ts` +
`infrastructure/analysis-unit/materializer.ts` (конечная карта `path → bytes`,
теговые локаторы `repo:`/`monorepo:`, отказ на `..` и symlink-escape, дайджест unit) ·
`scripts/emit-build-digest.mjs` в `npm run build` · починка `hashConfig` · раздел
`SECTION_IDS` / `DEFAULT_SECTION_IDS` · `BuildProjectMapUseCase.execute(cwd, sources?)`.

Проверяемо: опубликованные тест-векторы RFC 8785 проходят · golden на стабильность
fact-id · **round-trip якорей на кириллической фикстуре** · `project-map facts
--unit-digest` на midas дважды → идентично, и на **копии checkout по другому
абсолютному пути** → всё ещё идентично (это предвестник two-machine гейта §16,
демонстрируемый уже сейчас) · разовая перегенерация `PROJECT_MAP.md` репозитория
под исправленный `configHash`.

### Фаза B — OpenAPI-first inbound → инвентарь midas (~1100 src / 700 тестов)

Строим: секция `openapi:` в zod + теговые локаторы + `spec_locator_outside_repo` /
`monorepo_root_unresolved` как pre-build config-ошибки · `IOpenApiReader` +
`infrastructure/openapi/yaml-openapi-reader.ts` (3.0/3.1; транзитивное замыкание
локальных и path-`$ref` внутри заякоренного корня; 2.0 → `openapi_spec_unreadable`) ·
`openapi/path-grammar.ts` (все 8 правил §6.3, включая `%2F` → верхний регистр hex) ·
`openapi/compose.ts` (§12: `mount + basePath + spec_path`, каждый ровно один раз,
**без эвристики дедупликации `/v2/v2`** — совпадение `servers[0].url` midas с его
`Mount`-префиксами делает это точным живым тестом) · `merge/{core, merge-table,
resolution, diagnostics}.ts` (полная таблица §7.4, лестница §7.5, агрегация §7.6 с
`count` = число различных якорей) · `render/{artifact, sidecar}.ts` · `output.facts`

- побайтовый `--check` + новые коды выхода.

Проверяемо: midas отдаёт полный инвентарь по всем 5 спекам с `handler: unknown` и
диагностиками `openapi_route_not_in_code`, байт-стабильно между прогонами и
checkout'ами. **Здесь садится оракул-фикстура №1.** Inbound-покрытие показывает
честный объявленный знаменатель, а pay_plus (спеки нет) — `unmeasured`, никогда не
100%: правило честности §9 подтверждается на живом репозитории.

### Фаза C — индексы + интрапроцедурный нормализатор → inbound pay_plus (~1400 src / 900 тестов)

Строим: `index/import-index/{python,typescript,go}.ts` (module specifier + imported
symbol + local alias + провенанс; python `import`/`from…import`/`as` и относительные
импорты через манифест unit; TS/JS с цепочками ре-экспорта и **страж циклов** по
`(file, exportedName)`; Go — `import_spec` с алиасом/`_`/`.`, идентификатор пакета =
алиас, иначе `package X` из unit, иначе последний сегмент пути с шагом назад через
`^v\d+$`) · `index/declaration-index/*` · `index/hierarchy.ts` (обход иерархии внутри
unit) · `value/{ir, lattice, budget, engine}.ts` + `fold/python.ts` (только
интрапроцедурно) · `inbound/ladder.ts` + `adapters/python/{aiohttp,declared-dsl}.ts` ·
блок конфига `analysis_unit:` · канонизация `{order_id:[^/]+}` в позиционную дыру.

Почему именно inbound pay_plus: он гоняет импорт-индекс (провенанс
`class Url(PrefixedUrl)` через базу из shared-lib), иерархию (**глагол из
унаследованного `async def post`**), const-fold (`PREFIX + path`) и §6.3 — **без**
межпроцедурных сумм и **без** привязки target.

Проверяемо: все 220 деклараций `Url(...)` в 12 модулях разрешаются, включая смесь
префиксного `Url` и алиасного `PureUrl` в `routes/public.py`, голый беспрефиксный
`Url` в `routes/utility.py` и сплат `(*RETAIL_CRM_ROUTES, Url(...))` в `routes/cms.py`.
6 подклассов `web.Application` компонуют свои `_urls`, включая
`YandexPayPlusPublicApplication._urls + (...)`. **Оракул-фикстура №2.**

### Фаза D — Go router value identity → inbound midas + линковка хендлеров (~900 src / 700 тестов)

Строим: `fold/go.ts` (interpreted/raw строки, **const-fold BinaryExpr** для
`options.BaseURL+"/x"` при доказуемо пустом `BaseURL`) · `inbound/adapters/go/chi.ts`
(идентичность значения роутера по §5.1) · поддержка `identity_preserving` включая
`binds: closure_arg0_param0` · линковка хендлера от
`var _ generated.ServerInterface = &V2Api{}` + `operationId` ↔ Go-метод (§12 требует
доказанный версионированный адаптер генератора; вывод oapi-codegen в дерево не
попадает, поэтому это объявленная привязка `detect.inbound.generated[]` с дайджестом
адаптера в отпечатке реестра — ноль или несколько соответствий дают
`unknown(operation_mapping_unresolved)` + `generated_operation_unresolved`, `handler`
никогда не выдумывается).

Сверка с `scripts/route_coverage/main.go` (живой `chi.Walk`): 94 + 2 регистрации ·
7 `Mount` собраны по идентичности значения через `b.withStats(v1Router).With(mw...)` ·
все 94 pay-роута внутри четырёх рукописных реализаций `HandlerWithOptions` через
затенение `r` в `r.Group(func(r chi.Router){…})` · корневой роут с inline-замыканием
`/redirect-host/{appId}` · `/ping` корректно **не** роут · **ноль из 784 декоев**
`r.Header.Get` / `resource.Get`.

Почему декои умирают без единого правила по именам: лестница никогда не спрашивает
«как называется член». Она спрашивает «принадлежит ли значение получателя множеству
идентичностей роутера». У `r.Header.Get(...)` получатель это `r.Header` — селектор
по `r`, а не `r`; `resource` никогда не связывался с `chi.NewRouter()`. Это выносим
в оракул явным утверждением.

Дальше отрабатывает таблица слияния §7.4: инвентарные факты фазы B и роутерные
факты фазы D сливаются по `(mechanism, route, method)` в один обогащённый факт с
`provenance: ["openapi","router"]`.

### Фаза E1 — declared sinks + registry + лестница §5.2A → outbound pay_plus (~700 src / 500 тестов)

Строим: `outbound/{ladder, sinks, target-binding}.ts` · **цепочки селекторов** ·
`method: {from: member}` · `detect.outbound.registry` — 49 голых аннотаций уровня
класса в `InteractionClients` читаются как привязки типов, env-варианты
переаннотируют тот же атрибут → конечное множество типов → коррелированные варианты
§7.3 · шаги 2 и 3 лестницы §5.2A · `IConfigKeyDeclarationResolver` +
`infrastructure/config-keys/python-settings.ts` (находит `SATURN_API_URL` в
`settings/030-interactions.conf`; per-env варианты держатся на **оси env** и
никогда не резолвятся в значение).

Проверяемо: 264 места `await self.clients.<attr>.<method>(...)` (227 в
`core/actions/`) → owner-операции · 49 destination через шаг 3 лестницы ·
`interaction_method=` как обязательный первый kwarg отсекает любой `dict.get()`
(жёсткий негатив) · `endpoint_url(f'api/v1/{self.SATURN_SERVICE_NAME}/search')` →
**template с дырой `config_ref`** · `get_split_client(country)`, возвращающий один
из 4 клиентов по трём веткам → коррелированный `choice` → `ambiguous`, **никогда
`conflicting`** (прямой гейт §16).

### Фаза E2 — record-решётка + field-write summaries → outbound midas (~800 src / 600 тестов)

Строим: `value/record.ts` (значение это скаляр `ValueIr` **или** `RecordIr =
Map<field, ValueIr>` с флагом `top`; посев из композитного литерала или из суммы
конструктора; `req.APIMethod = X` — strong update; `(*req.Params)["k"] = v` —
запись **через** поле, ослабляющая только его) · суммы записи полей при escape
(вызов `AddHeaderIfOptionalString(&req, …)` внутри unit в пределах глубины 3
вычисляет множество записываемых полей — пишет только через `Headers`, поэтому
`APIMethod`/`Method` выживают; escape в немоделируемого callee → все поля
`unknown(alias_mutation)`) · суммы методов с value-receiver, возвращающих свой тип
(`NewRequest().WithContext(ctx)`) · `call[]` как объекты с переопределением на член ·
`infrastructure/config-keys/go-struct-yaml.ts` (поле Go-структуры + тег `yaml:"atlas"`
→ ключ `atlas.base_url` в `package/etc/payments-sdk-backend/production.yaml`) ·
поиск owner-конструкции по объявленному возвращаемому типу (шаг 2 лестницы).

Проверяемо: 137 мест через `req := NewRequest()...; req.APIMethod = "…";
c.MakeRequestWithError(req, …)` · форма со структурным литералом
`Request{APIMethod: configAPIMethod, …}` · **метод по умолчанию GET восстанавливается
из суммы конструктора `NewRequest()`, а не спецкейсом** · 46 ключей `base_url` ·
переопределение `target: arg 2` на члене `MakeRequestWithRawResponseAndBaseUrl` ·
**негативы §16: ни одного gRPC-факта из транзитивно достижимого `otlptracegrpc`;
внутренний resty-транспорт синка не даёт второго outbound-факта.**

Проверка бюджета: `arg 0` — глубина 0; сумма конструктора и каждая сумма escape —
глубина 1; путь owner-construction `call-site → owner type → construction site →
factory arg 0 → поле конфиг-структуры` не тратит межпроцедурных рёбер сверх 1.
До 3 далеко.

### Фаза F — shared-lib половинки + candidate universe + coverage (~700 src / 600 тестов)

Строим: `detect.outbound.module_ids` + **обе половинки** §5.2B с ключом джойна
`(module_id, callee_operation)` · candidate universe §9 как знаменатель покрытия, с
исключением половинок `operation_in_library[_root]` по §7.5.2 ·
`external_call_unclassified` / `external_registration_unclassified` в границах
universe · markdown-секция `detection_coverage`.

Проверяемо: 44 из 60 пакетов взаимодействий pay_plus, являющихся тонкими подклассами
`pay.lib.interactions.<svc>.client.Abstract<X>Client`, отдают потребительские
половинки с `path: unknown(operation_in_library)`, установленным `module_id`,
разрешённым `callee_operation` **и разрешённым `destination`** через шаг 3 лестницы
(`SplitClient.BASE_URL = settings.SPLIT_API_URL`) — ровно тот кейс, который
буквальное чтение §5.2A теряло целиком. Знаменатели покрытия честны на обоих репо.

---

## Отложено (подтверждено)

1. **Queue producer/consumer (§5.3).** У midas очередей нет; `taskq` pay_plus —
   БД-очередь по enum `WorkerType`, не wire-топик, и §5.3 («topic IR несёт полную
   wire-топологию») она не удовлетворяет. Оставляем в схеме только закрытый enum
   `action` и обязательную негативную фикстуру `Topic()`-декоя.
2. **Swagger 2.0 в §12.** Ветка композиции `basePath` и фикстура `/v2/v2` — без оракула.
3. **`openapi.consumes` / generated-client outbound (§5.2.1).** Ни у одного сервиса
   нет сгенерированного клиента в дереве; писать нечем проверить.
4. **Per-call-site маркер (§4.3).** Резервируем код `marker_invalid` и слот
   exit-code, чтобы добавление позже не было ломающим.
5. **Java/Kotlin (§11 фаза 2), фаза G (`--strict` baseline, выпил legacy-слайсов,
   миграция остальных пяти слайсов на `analysis_unit`).** Вне текущего захода.
6. **Резолвинг локатора `monorepo:`.** Тег парсим и поднимаем
   `monorepo_root_unresolved` уже в фазе B (схема должна быть верной с первого дня),
   но кросс-корневой обход `$ref` откладываем — спеки midas все `repo:`.
7. **Раскрытие опциональных сегментов (§6.3).** Ни chi, ни aiohttp их не имеют:
   отдаём типизированную дыру.

**Явно НЕ откладываем** коррелированные варианты `choice` (§7.3): `get_split_client`
в pay_plus — живой кейс и именованный гейт §16.

---

## Верификация

Сквозная проверка после каждой фазы, всё локально и воспроизводимо:

```sh
pnpm install && pnpm build && pnpm lint && pnpm format:check && pnpm test
```

**Юнит/golden (в репозитории):** тест-векторы RFC 8785 · стабильность fact-id ·
round-trip якорей на кириллице · §5A — интрапроцедурно, суммы ≤3 слоя, все стоп-условия
из закрытого enum, **diamond-кейс** (короткая ветка + contributing-ветка глубины 4 →
`unknown(depth_exceeded)` независимо от порядка) · грамматика путей §6.3 · таблица
слияния §7.4 · лестница §7.5 · агрегация диагностик (`count` = различные якоря).

**Негативные фикстуры (обязаны не давать фактов):** `header.Get`/`query.Get` ·
`resource.Get("/bank_names")` · `otelgrpc`/`otlptracegrpc` → нет gRPC-факта ·
`topic()`/`Topic()` декой · затенённый одноимённый не-Nest декоратор ·
транспорт внутри синка → нет второго outbound-факта · `http.NewRequest` без
достижимого send → нет факта · `NewRequest` + `Do` → **ровно один** факт ·
glob/name-pattern в селекторе → config-time reject.

**На сервисах (read-only FUSE — ничего не пишем в Arcadia):** копируем сервис во
временный каталог, кладём туда доработанный `.project-map.yaml` с блоком
`analysis_unit:` и `openapi:`/`detect:`, гоняем `node dist/cli/index.js build --check`.

- midas: сверяем множество inbound-фактов с оракулом из `scripts/route_coverage/main.go`
  (`chi.Walk`) — 96 роутов, 7 `Mount`, `/ping` отсутствует, ноль декоев;
  outbound — 137 операций, 46 `config_ref` на `base_url`.
- pay_plus: 220 inbound из 12 модулей маршрутов с глаголами из иерархии хендлеров;
  264 outbound call-site, 49 destination, 44 shared-lib половинки с ключом джойна.
- Байт-равенство: две сборки в одном каталоге и сборка из копии по **другому
  абсолютному пути** дают идентичный `facts.json` (гейт §16 в доступной нам форме).

Оракулы обоих сервисов коммитим в `tests/oracles/<service>/expected.json` как
регрессионные фикстуры до расширения раскатки (§18).

## Порядок работ

1. Правки спеки до v4.1 в `intraservice-map` (три аддитивные правки + фиксация
   отложенного) — **до кода**, чтобы реализация не расходилась с источником правды.
2. Фаза A → B → C → D → E1 → E2 → F, каждая заканчивается зелёными
   `lint`/`format:check`/`test` и демонстрацией на живом сервисе.
3. Коммиты — по фазам, гранулярно внутри (ядро/адаптер/фикстуры отдельно), без
   AI-атрибуции.

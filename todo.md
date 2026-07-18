# vue-error-boundary-kit — план работ

План составлен по [ТЗ.md](ТЗ.md). Тулчейн — по образцу соседних пакетов: vite (lib mode) + vue-tsc для сборки (не tsup — нужна компиляция `.vue` SFC), vitest + eslint/prettier, exports-map с отдельными точками входа.

**Статус: v1 реализован, все обязательные пункты ТЗ закрыты — включая весь изначальный v2-roadmap (раздел 12 ТЗ), перенесённый в 0.1.0 по запросу пользователя.** Детали ниже.

## 0. Инициализация проекта

- [x] `package.json`: имя `@macrulez/vue-error-boundary-kit` (по ТЗ п.11) → позже переименовано в unscoped `vue-error-boundary-kit`, см. п.15; `type: module`, `sideEffects: false`
- [x] `peerDependencies`: `vue: ^3.4.0` (без production-зависимостей)
- [x] `exports` map: `.`, `./adapters/console`, `./adapters/http`, `./adapters/sentry`, `./adapters/bugsnag`, `./adapters/logrocket`, `./adapters/rate-limit`, `./global-capture`, `./devtools`
- [x] `tsconfig.json` со `strict: true` (+ `tsconfig.build.json` — та же конфигурация, но исключает `__tests__` из сборки деклараций)
- [x] `vite.config.ts`: multi-entry lib mode (`index`, `useGlobalErrorCapture`, `devtools`, `adapters/console`, `adapters/http`, `adapters/sentry`, `adapters/bugsnag`, `adapters/logrocket`, `adapters/rateLimit`), esm+cjs, `external: ['vue']`. Сборка типов — `vue-tsc --declaration --emitDeclarationOnly` (не tsup: нужен реальный компилятор `.vue` SFC)
- [x] `vitest.config.ts` + `@vue/test-utils`, окружение `happy-dom`
- [x] `eslint.config.js`, prettier
- [ ] `.github` / CI — не настроено, вне блокирующего скоупа v1 (можно добавить отдельно)

## 1. Типы (`src/types.ts`)

- [x] `CapturedError`, `ErrorReporter` — точно по разделу 4 ТЗ
- [x] Вспомогательные типы пропсов/событий `ErrorBoundary` и опций `useErrorBoundary`

## 2. Core: `useErrorBoundary()`

- [x] `src/useErrorBoundary.ts`: `error` (`shallowRef` — `CapturedError.error` может быть произвольным брошенным значением, глубокая реактивность не нужна и портит идентичность), `hasError`, `reset()`, `captureError(err, info?)`
- [x] Опция `onError`
- [x] Guard от рекурсии — брошенное исключение внутри `onError`/reporter перехватывается и логируется, никогда не пробрасывается наружу (`src/internal.ts: safeInvoke/safeInvokeAsync`)

## 3. Core: `<ErrorBoundary>` (`src/ErrorBoundary.vue`)

- [x] `onErrorCaptured` перехват + запись состояния
- [x] Слоты: `default`, `fallback` (scoped: `error, reset, retry, retryCount, canRetry`)
- [x] Пропсы: `resetKeys`, `resetOnPropsChange`, `beforeReset` (в ТЗ п.3.1 назван `onReset` — переименовано, см. п.13 ниже), `isolate` (default `true`), `maxRetries`, `reporter` (добавлен сверх таблицы п.3.1 ТЗ — необходим, чтобы декларативно подключать adapter к конкретному boundary, без этого п.5/10 ТЗ не реализовать)
- [x] События: `error`, `reset`
- [x] `resetKeys` watcher → автосброс (сравнение по `Object.is` каждого элемента)
- [x] `retry()` / `retryCount` инкремент, `canRetry` уходит в `false` после `maxRetries`
- [x] `isolate: false` — проброс наверх через `provide/inject` канал (не через нативный bubbling `onErrorCaptured`, т.к. каждый boundary сам гасит ошибку через `return false`, чтобы рендерить свой fallback)
- [x] Реализация только через официальные API (`onErrorCaptured`, `h()`/template) — без внутренних API VDOM-рендерера
- [x] `source: 'render' | 'async'` — Vue репортит и синхронный, и асинхронный `setup()` с одинаковой строкой `"setup function"`; разделяем их доп. проверкой `instance.type.setup.constructor.name === 'AsyncFunction'` (найдено и закрыто через ручной прогон demo в браузере — юнит-тесты с `render()`-throw это не ловили)
- [x] `defineExpose({ error, hasError, retryCount, canRetry, reset, retry })` — доступ к состоянию/методам boundary через `ref` снаружи `fallback`-слота (найдено вручную пользователем: в demo-блоке 4 после `isolate:false` внешний boundary забирает рендер целиком, и кнопка вне слотов не могла до него дотянуться — типичный реальный кейс, не только демо-баг)
- [x] `shouldCatch` проп — предикат `(error: CapturedError) => boolean`; `false` пропускает ошибку насквозь через нативный bubbling `onErrorCaptured` (без нашего provide/inject-канала — это не «обработано локально», это «не наше»), без состояния/report/fallback. Добавлено по запросу пользователя после сравнения с `vue-error-boundary` (см. диалог) — типовой кейс: `AbortError` от отменённого fetch не должен считаться падением компонента

## 4. `useGlobalErrorCapture()` (`src/useGlobalErrorCapture.ts`)

- [x] Отдельная точка входа, не подключается по умолчанию
- [x] `window` `error` + `unhandledrejection` → единый путь через `dispatchReport`/`onError`
- [x] No-op при отсутствии `window` (SSR); автоочистка через `onScopeDispose`, если вызван внутри активного effect scope
- [x] `shouldCatch` — тот же предикат-фильтр, что и у `<ErrorBoundary>` (симметрия API); полезно против шума типа `ResizeObserver loop`/расширений браузера

## 5. Reporting-адаптеры (`src/adapters/*`)

- [x] `adapters/console.ts` — дефолтный dev-adapter
- [x] `adapters/http.ts` — батчинг + `navigator.sendBeacon` через `pagehide` (обычный флаш — `fetch`, `sendBeacon` — только как safety net на закрытии страницы)
- [x] `adapters/sentry.ts` — структурно типизированная обёртка (`SentryLikeClient`), `@sentry/vue` не импортируется
- [x] `adapters/bugsnag.ts` — обёртка над `Bugsnag.notify(error, onError)`; API сверен вживую через WebSearch/WebFetch (docs.bugsnag.com), а не по памяти — `event.severity`/`event.context`/`event.addMetadata(...)`
- [x] `adapters/logrocket.ts` — обёртка над `LogRocket.captureException(error, {tags, extra})`; API тоже сверен вживую (docs.logrocket.com). LogRocket требует скалярные значения в `extra` — нескалярный `context` автоматически сериализуется через `JSON.stringify`
- [x] `adapters/rateLimit.ts` (`./adapters/rate-limit`) — `createRateLimitedReporter(reporter, opts)`: дедуп по `source+componentName+message` в окне + потолок `maxPerWindow` репортов за `windowMs`; защита от утечки памяти при большом числе РАЗНЫХ сигнатур (sweep при превышении 1000 записей); каждый обёрнутый reporter вызывается через `safeInvokeAsync`, чтобы падение одного не блокировало остальные
- [x] `src/adapters/_shared.ts` — общий `corePayloadFields()`/`toScalarRecord()` для дедупликации между http/sentry/bugsnag/logrocket; вынесено ИЗ `internal.ts` в отдельный файл намеренно, чтобы Rollup не мог случайно затянуть это в core-чанк (`index.mjs`) — проверено сборкой, core не изменился в размере
- [x] Каждый — отдельный entry point; проверено сборкой (`dist/adapters/*.mjs` не тянут `internal.ts`/core)

## 6. SSR / гидратация — важное отступление от буквального текста ТЗ

Эмпирически проверено (см. README → «SSR notes»): у Vue 3 в SSR нет реактивного second pass — к моменту, когда `onErrorCaptured` выставляет состояние ошибки, `render()` boundary уже вернул результат. Показать реальную разметку `fallback`-слота в HTML с сервера без внутренних API рендерера или повторного выполнения `setup()` дочернего дерева невозможно (а и то, и другое прямо запрещено п.2 ТЗ). Обсуждено с пользователем — согласован honest-scope:

- [x] Ошибка в дочернем `setup()`/render не роняет `renderToString`, соседний контент рендерится нормально (не 500-страница)
- [x] `error`-событие и reporter отрабатывают на сервере ровно так же, как на клиенте
- [x] Гидратация всегда сходится к корректному интерактивному состоянию клиента, даже при расхождении сервер/клиент (проверено тестом); собственное предупреждение Vue о hydration mismatch в этом случае возможно в dev-сборке (в проде вырезается) — задокументировано как честное ограничение, а не баг
- [x] Раздел README «Nuxt integration» (соотношение с `NuxtErrorBoundary`/`error.vue`)

## 7. Тесты (vitest + @vue/test-utils) — 84 теста, покрытие 98.2% (актуально на п.13)

- [x] 1. Синхронная ошибка в render дочернего компонента → fallback
- [x] 2. Ошибка в `async setup()` → fallback, `source: 'async'`
- [x] 3. `resetKeys` меняется → автосброс, ре-рендер `default`
- [x] 4. `retry()` восстанавливает `default`, повторная ошибка → `retryCount++`
- [x] 5. `maxRetries` исчерпан → retry-контрол задизейблен
- [x] 6. `isolate: false` → ошибка всплывает к родительскому boundary
- [x] 7. SSR-рендер с ошибкой → без исключения в `renderToString`, корректный HTML вокруг сбойного участка (см. п.6 про honest-scope)
- [x] 8. Гидратация после SSR-fallback → корректное самовосстановление клиента (см. п.6)
- [x] 9. `useErrorBoundary().captureError()` вручную обновляет `error`/`hasError`
- [x] 10. Reporting-adapter вызывается ровно один раз на ошибку (нет дублей при вложенных boundary)
- [x] Доп.: adapters (console/http/sentry) и `useGlobalErrorCapture` — не входили в обязательный список, но были без покрытия (0%), добавлены до порога 80%
- [x] Доп. регресс-тест: синхронный (не async) `setup()`-throw должен маркироваться `source: 'render'`, а не `'async'` — найдено вручную через demo, не через юниты
- [x] Доп.: `shouldCatch` — пропуск через нативный bubbling (и в `<ErrorBoundary>`, и в `useGlobalErrorCapture`), отсутствие report/событий на отфильтрованной ошибке
- [x] Доп.: `adapters/bugsnag`, `adapters/logrocket` — вызов клиента с сырой ошибкой, метаданные/scalar-коэрсия
- [x] Доп.: `adapters/rateLimit` — дедуп, сброс окна по времени, разные сигнатуры не дедупятся, обёрнутый reporter, который падает, не блокирует остальные, падающий `onSuppressed` не ломает репортинг
- [x] Доп.: `errorHistory`/`ErrorHistoryPanel` — запись/лимит/eviction/`clear()`, независимость двух инстансов истории друг от друга, реактивный рендер панели

## 8. Демо / playground

- [x] `demo/` (vite) — 10 секций: базовый boundary+retry, resetKeys, maxRetries, nested/isolate, `useErrorBoundary()` ручной capture, async setup, reporting-adapters + `useGlobalErrorCapture`, devtools error history, rate-limit/dedup
- [x] Прогнано в реальном браузере через Playwright (headless), со скриншотами — все сценарии работают; именно так найден и исправлен баг с `source: 'async'` выше, а также баги с неповторяемостью демо-сценариев (1/2/4/6) и с общим состоянием rate-limit окна между двумя demo-кнопками (не баг пакета — уточнение для наглядности демо)

## 9. README

- [x] Problem → Quick start → API reference → Nested boundaries → catch/no-catch list → Nuxt integration → Reporting adapters → SSR notes → Comparison table
- [x] Сравнительная таблица: `errorCaptured` "из коробки" vs `NuxtErrorBoundary` vs `vue-error-boundary-kit`

## 10. Финальная проверка перед публикацией

- [x] `vue-tsc --noEmit` (strict) без ошибок
- [x] Бюджет размера: ядро (`index.mjs` + shared `internal` chunk) ≈ 1.8 kB gzip — не изменилось после bugsnag/logrocket/rate-limit/devtools (новые entry point'ы полностью изолированы, не тянутся в core-чанк); чуть выросло (1.7→1.8) после `internalErrorPrefix` — ожидаемо, с запасом укладывается в бюджет 3 kB
- [x] Каждый adapter — отдельный chunk, не тянется транзитивно
- [x] `npm pack --dry-run` — состав пакета корректен (57 файлов, ~25.9 kB); отдельно найден и исправлен баг — `vue-tsc` по дефолтному `tsconfig` тянул `.d.ts` тестов в паблиш, закрыто через `tsconfig.build.json`
- [x] `package.json` метаданные (repository, keywords из п. 11 ТЗ)
- [ ] Версия `0.1.0` — публикация в npm не выполнялась (не запрошена)

## 11. Пост-релизные улучшения (после первичной сдачи v1)

- [x] Демо: во всех «повторяемых» сценариях (1, 2, 4, 6) была одна и та же ошибка — `Crasher`/`AsyncCrasher` бросают исключение один раз внутри `setup()`, это не реактивная проверка; смена пропа на уже смонтированном инстансе ни к чему не приводит. Исправлено принудительным ремонтом через `:key`-счётчик + кнопки "break it again" во всех четырёх местах (найдено пользователем вручную в блоках 1 и 6, остальные — проактивный аудит по аналогии)
- [x] Сравнение с существующим `vue-error-boundary` (npm, dillonchanis) по запросу пользователя — подтвердило, что мы покрываем весь их функционал плюс retry/reset/adapters/composable/global-capture/SSR-документацию; у них `vue` — обычная `dependencies`, а не `peerDependencies` (баг); единственное не покрытое 1:1 — fallback как компонент по ссылке (`fall-back`/`params` проп) вместо слота — осознанно не стали дублировать, слот функционально шире
- [x] `CHANGELOG.md` (Keep a Changelog, по образцу vue-toast-kit/vue-i18n-kit)

## 12. Весь roadmap из раздела 12 ТЗ перенесён в 0.1.0 (по прямому запросу пользователя)

Изначально три пункта были явно вынесены в v2 (раздел 12 ТЗ). Пользователь попросил сделать их сразу в рамках 0.1.0, публикации ещё не было — оснований откладывать нет.

- [x] Rate-limit/дедупликация — `adapters/rateLimit.ts`, детали в разделе 5 выше
- [x] Adapter под Bugsnag/LogRocket — `adapters/bugsnag.ts`, `adapters/logrocket.ts`; перед реализацией API обеих сторонних SDK сверен через WebSearch/WebFetch с официальной документацией (не по памяти) — гадать на форме реального стороннего API недопустимо
- [x] Devtools-плагин для истории ошибок — переосмыслен как `createErrorHistory()` + `<ErrorHistoryPanel>` (`/devtools`), а НЕ как интеграция с браузерным расширением Vue Devtools. Полноценная интеграция потребовала бы `@vue/devtools-api` как зависимость, что прямо противоречит требованию п.2 ТЗ "Zero external dependencies (только vue в peerDependencies)". `history.record` — обычный `ErrorReporter`, поэтому подключается через уже существующий механизм reporter'ов без изменений в `ErrorBoundary.vue`/`useErrorBoundary.ts`
- [x] `ErrorHistoryPanel.vue` — инлайн-стили вместо `<style scoped>`: у Vite `<style>` в SFC уходит в отдельный `dist/style.css`, который пришлось бы отдельно импортировать (как `vue-toast-kit/style.css`) — плохой DX для маленького debug-компонента, легко забыть; сначала собрал со scoped-стилями, увидел лишний файл в `dist/`, переделал

Раздел «Не в этом плане» из первой версии этого файла — пуст, всё оттуда реализовано.

## 13. `internalErrorPrefix` + найденный и исправленный баг с `onReset` (по запросу пользователя)

Пользователь заметил префикс `[vue-error-boundary-kit]` в консоли (у `adapters/console`'s `report()`) и попросил сделать настраиваемым — сделано (`prefix` опция). Затем попросил сделать настраиваемым и ВТОРОЙ, внутренний лог (`internal.ts`'s `reportInternalFailure` — safety-net на случай, если пользовательский `onError`/`onReset`/reporter/`onSuppressed` сам бросает исключение).

- [x] `internalErrorPrefix` — добавлен во ВСЕ 4 точки, где используется `safeInvoke`/`safeInvokeAsync`/`dispatchReport`: `<ErrorBoundary>`, `useErrorBoundary()`, `useGlobalErrorCapture()`, `createRateLimitedReporter()`. Дефолт `[vue-error-boundary-kit]`, `''` — убрать совсем
- [x] **Найден реальный баг при написании теста на `internalErrorPrefix` для `<ErrorBoundary>`**: проп `onReset` коллизирует с автоматическим listener-пропом, который Vue сам генерирует для `emit('reset')` — это ОДИН И ТОТ ЖЕ ключ `onReset` на уровне resolved props. `emit()` у Vue вызывает `props.onReset`, если он есть, НЕЗАВИСИМО от того, что это «настоящий» объявленный проп — значит пользовательский `onReset` вызывался ДВАЖДЫ за один reset, и второй вызов (через `emit()`) происходил СНАРУЖИ нашего `safeInvoke`, то есть если `onReset` бросает исключение — оно улетает как необработанный promise rejection мимо recursion guard из п.8 ТЗ. Баг существовал с самого начала (с первой реализации `<ErrorBoundary>`), просто ни один более ранний тест не комбинировал «бросающий onReset» + реальный клик по retry
- [x] **Исправлено переименованием**: `onReset` → `beforeReset` везде — и в `ErrorBoundaryProps`, и (для симметрии API, хотя там бага не было — composable не проходит через `emit()`) в `UseErrorBoundaryOptions`. Пакет ещё не публиковался — это лучший момент для переименования, миграционная стоимость нулевая
- [x] Регресс-тесты: `beforeReset` вызывается ровно один раз за reset при одновременном использовании с `@reset`-слушателем; бросающий `beforeReset` не улетает необработанным (проверено — до фикса тест-ран показывал `Unhandled Rejection` на уровне всего vitest-прогона, после фикса — чисто)
- [x] README: таблица пропсов `<ErrorBoundary>` + отдельная врезка "Why beforeReset, not onReset?"; `internalErrorPrefix` задокументирован во всех 4 местах
- [x] 84 теста (было 73), покрытие не упало

## 14. Финальный аудит перед публикацией (по прямому запросу пользователя — "давай всё перепроверим")

- [x] **Найден реальный блокер публикации**: в `package.json` отсутствовал `publishConfig.access: public`. Для scoped-пакета (`@macrulez/...`) без этого поля `npm publish` попытается опубликовать пакет ПРИВАТНО, что требует платного npm-аккаунта, и упадёт на бесплатном. У соседнего `vue-command-palette` это поле есть — у нас забыли. Добавлено *(устарело после п.15 — пакет переименован в unscoped, поле убрано за ненадобностью)*
- [x] Проверено `npm view @macrulez/vue-error-boundary-kit` — имя свободно на registry (404), коллизий нет *(см. также п.15 — unscoped-имя проверено отдельно)*
- [x] `npx prettier --check src/` ни разу не гонялся по всему дереву после добавления bugsnag/logrocket/rateLimit/devtools/internalErrorPrefix — нашлось 7 файлов с отклонениями форматирования, поправлено `--write`, перепроверено lint+typecheck+тесты после
- [x] **Реальная (не dry-run) проверка публикуемости**: `npm pack` → `npm install <tarball> vue` в чистый scratch-проект → импорт всех 9 точек входа (`.`, `/global-capture`, `/devtools`, 5×`/adapters/*`, `/adapters/rate-limit`) через настоящий `package.json` `exports` (не относительные пути к `dist`) в ESM и CJS по отдельности → фактический SSR-рендер `<ErrorBoundary>` через установленный пакет. Всё резолвится и работает
- [x] Программно сверены все записи `exports` в `package.json` с реальными файлами в `dist/` — 0 расхождений
- [x] Demo: `vue-tsc --noEmit` + продакшен-сборка (`vite build`, не только dev-сервер) — обе чистые
- [x] Полный автоматизированный прогон demo в браузере (Playwright) по всем 10 секциям — 24/25 проверок; единственный "провал" оказался ложным срабатыванием теста (лог в секции 7&8 капается на 8 записей и уже был заполнен предыдущими секциями, поэтому счётчик записей не рос — сама фича при этом работает верно, что подтвердил соседний чек). 0 неожиданных `[Vue warn]`, ровно 2 ожидаемых uncaught-ошибки (то, что намеренно демонстрирует секция 7&8)
- [x] README сверен построчно с текущим кодом: все пропсы/опции/поля типов/пути импортов в таблицах и примерах сверены 1:1 с `types.ts`/`ErrorBoundary.vue`/`package.json` exports — расхождений не найдено
- [x] Удалены все временные артефакты (`.tgz` в корне репо, скриншоты, `demo/dist`)

## 15. Переименование в unscoped `vue-error-boundary-kit` (по прямому запросу пользователя)

Пользователь заметил, что `vue-error-boundary-kit` (без `@macrulez/`) тоже свободно на npm registry — легко перепутать с `vue-error-boundary` (пакетом dillonchanis без `-kit`, с которым сравнивали ранее), поэтому проверил отдельно перед переименованием: `npm view vue-error-boundary-kit` → 404, действительно свободно.

- [x] `package.json`: `name` → `vue-error-boundary-kit`; `publishConfig.access: public` убран — это поле имеет смысл только для scoped-пакетов, для unscoped npm всегда публикует публично, оставлять его было бы бессмысленно/вводило в заблуждение
- [x] Заменено `@macrulez/vue-error-boundary-kit` → `vue-error-boundary-kit` во всех местах: `demo/vite.config.ts` (алиасы), `demo/tsconfig.json` (paths), `demo/src/App.vue` (все импорты), `README.md`, `CHANGELOG.md` — массовой заменой + точечная проверка, что строка `[vue-error-boundary-kit]` (лог-префикс в консоли, не имя npm-пакета) не была случайно задета (она и не должна была, т.к. никогда не содержала `@macrulez/`)
- [x] `ТЗ.md` НЕ трогали — это исходный документ требований, зафиксированный на момент старта; в нём имя `@macrulez/vue-error-boundary-kit` из п.11 остаётся как есть, отклонение зафиксировано здесь, а не переписыванием исходного ТЗ
- [x] `package-lock.json` пересобран через `npm install` (не редактировался руками)
- [x] Полная повторная валидация после переименования: typecheck, lint, тесты+покрытие, сборка, `npm pack --dry-run`, реальная установка тарбола в чистый scratch-проект под новым именем, demo typecheck+build+прогон в браузере — см. результаты ниже

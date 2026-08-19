<div align="center" style="background:#111827;border-radius:20px;padding:28px 20px 20px;margin-bottom:32px">
  <h1 style="color:#f9fafb;margin:0 0 32px;font-size:2.2em;letter-spacing:-0.03em;font-weight:700;font-family:sans-serif">
    vue-error-boundary-kit
  </h1>
  <img
    src="https://s3.twcstorage.ru/c9a2cc89-780f97fd-311d-4a1a-b86f-c25665c9dc46/images/npm/vue-error-boundary-kit.webp"
    alt="vue-virtual-scroller-kit"
    style="max-width:100%;width:auto;height:300px;border-radius:12px"
  />
</div>

[![npm version](https://img.shields.io/npm/v/vue-error-boundary-kit.svg)](https://www.npmjs.com/package/vue-error-boundary-kit)
[![CI](https://github.com/macrulezru/vue-error-boundary-kit/actions/workflows/ci.yml/badge.svg)](https://github.com/macrulezru/vue-error-boundary-kit/actions/workflows/ci.yml)
[![license](https://img.shields.io/npm/l/vue-error-boundary-kit.svg)](LICENSE)

Production-ready error boundaries for Vue 3 — a declarative `<ErrorBoundary>` component, a `useErrorBoundary()` composable for programmatic use, and an adapter-based reporting layer (Sentry / Bugsnag / LogRocket / plain HTTP) that isn't hard-baked into the core.

Zero runtime dependencies beyond Vue itself. Core bundle (`<ErrorBoundary>` + `useErrorBoundary`) is ~2.1 kB gzip; every reporting adapter is its own entry point and only ships if you import it.

---

## Contents

- [The problem](#the-problem)
- [Quick start](#quick-start)
- [API reference](#api-reference)
  - [`<ErrorBoundary>`](#errorboundary)
  - [`<AsyncBoundary>`](#asyncboundary)
  - [`useErrorBoundary()`](#useerrorboundary)
  - [`useGlobalErrorCapture()`](#useglobalerrorcapture)
  - [Types](#types)
- [Ignoring specific errors](#ignoring-specific-errors)
- [Nested boundaries](#nested-boundaries)
- [What `errorCaptured` does and doesn't catch](#what-errorcaptured-does-and-doesnt-catch)
- [Nuxt integration](#nuxt-integration)
- [vue-router integration](#vue-router-integration)
- [Reporting adapters](#reporting-adapters)
- [Rate-limiting & dedup](#rate-limiting--dedup)
- [Breadcrumbs](#breadcrumbs)
- [TanStack Query integration](#tanstack-query-integration)
- [Debugging: error history](#debugging-error-history)
- [Testing your app](#testing-your-app)
- [SSR notes](#ssr-notes)
- [Comparison](#comparison)

---

## The problem

React has had error boundaries as a first-class pattern for years. Vue 3 only gives you the low-level `onErrorCaptured` hook — every project ends up re-inventing a fallback-UI component with retry and error reporting around it. This package is that component, done once, with:

- a declarative `<ErrorBoundary>` with a `fallback` slot and retry;
- `useErrorBoundary()` for programmatic use outside a template boundary;
- a single adapter-based error-reporting mechanism (Sentry / Bugsnag / custom `fetch` — no hard dependency);
- `useGlobalErrorCapture()`, an opt-in separate entry point for what `errorCaptured` structurally cannot see (raw event-listener callbacks, timers, unhandled promise rejections).

## Quick start

```bash
npm install vue-error-boundary-kit
```

```vue
<script setup lang="ts">
import { ErrorBoundary } from 'vue-error-boundary-kit'
import UserProfile from './UserProfile.vue'

const userId = ref('42')
const routeId = ref('profile')

function handleError(error) {
  // error: CapturedError — see Types below
}
</script>

<template>
  <ErrorBoundary :reset-keys="[routeId]" @error="handleError">
    <template #default>
      <UserProfile :id="userId" />
    </template>
    <template #fallback="{ error, reset, retryCount }">
      <ErrorState :message="error.message" @retry="reset" />
    </template>
  </ErrorBoundary>
</template>
```

## API reference

### `<ErrorBoundary>`

| Prop | Type | Default | Description |
|---|---|---|---|
| `resetKeys` | `unknown[]` | — | When any value changes (compared with `Object.is`), the boundary auto-resets — same idea as `react-error-boundary`'s `resetKeys` |
| `resetOnPropsChange` | `boolean` | `false` | Reset whenever any prop reference changes, not just `resetKeys` |
| `beforeReset` | `() => void` | — | Called right before a reset (auto or manual). Not named `onReset` — see note below |
| `isolate` | `boolean` | `true` | `false` lets the error also propagate to the nearest ancestor `<ErrorBoundary>` |
| `maxRetries` | `number` | unlimited | Once reached, the fallback slot's `canRetry` becomes `false` |
| `reporter` | `ErrorReporter \| ErrorReporter[]` | — | Reporter(s) invoked once per captured error — see [Reporting adapters](#reporting-adapters) |
| `shouldCatch` | `(error: CapturedError) => boolean` | — | Return `false` to let an error pass through this boundary untouched — no state change, no report, no fallback — exactly as if it weren't there. See [Ignoring specific errors](#ignoring-specific-errors) |
| `internalErrorPrefix` | `string` | `'[vue-error-boundary-kit]'` | Prefix for the safety-net log emitted when your own `beforeReset`/reporter itself throws. Pass `''` to omit it |

> **Why `beforeReset`, not `onReset`?** This component also emits a `reset` event, and Vue derives `onReset` as that event's own listener prop. A declared prop with the identical name would collide with it: Vue's `emit()` looks up `props.onReset` independently of whether it's "really" a declared prop, so it would've fired twice per reset — and the second, emit-triggered call happens outside this package's own try/catch, defeating the recursion guard entirely if it throws. `beforeReset` avoids the collision structurally.

Events:

- `error(error: CapturedError)` — fired for every captured failure, including ones bubbled up from a descendant boundary with `isolate: false`.
- `reset()` — fired on every manual or automatic reset.

Slots:

- `default` — normal content.
- `fallback` — scoped slot: `{ error, reset, retry, retryCount, canRetry }`. `reset()` clears retry count too; `retry()` increments `retryCount` and re-attempts `default` without resetting the count.

Exposed (via a template ref): `error`, `hasError`, `retryCount`, `canRetry`, `reset()`, `retry()` — the same state and methods the `fallback` slot gets, but reachable from outside it (e.g. a retry control that lives elsewhere in the UI, or an ancestor recovering a boundary it doesn't render the fallback for). Calling `reset()`/`retry()` on a boundary that isn't in an error state is a harmless no-op.

```vue
<script setup>
const boundary = ref()
</script>

<template>
  <ErrorBoundary ref="boundary">…</ErrorBoundary>
  <button @click="boundary?.reset()">Reset from elsewhere</button>
</template>
```

#### Retry with backoff

`retry()` is instant and unconditional — fine for most cases, but for a transient/network-ish failure, retrying the instant the button is clicked usually just fails again the same way. `vue-error-boundary-kit/retry-backoff` wraps a template ref's `retry()` with an increasing delay instead:

```ts
import { createBackoffRetry } from 'vue-error-boundary-kit/retry-backoff'

const boundary = useTemplateRef('boundary')
const backoff = createBackoffRetry(boundary, { baseDelayMs: 1000, factor: 2, maxDelayMs: 30_000 })
```

```vue
<ErrorBoundary ref="boundary">
  <template #fallback="{ error }">
    <button :disabled="backoff.isPending.value" @click="backoff.retry()">
      {{ backoff.isPending.value ? 'Retrying…' : 'Retry' }}
    </button>
  </template>
</ErrorBoundary>
```

The delay is computed from the boundary's own `retryCount` (`baseDelayMs * factor ** retryCount`, capped at `maxDelayMs`), so each successive attempt waits longer. `cancel()` clears a pending retry. Works with `<AsyncBoundary>`'s ref too — both expose the same `{ retry, retryCount }` shape.

### `<AsyncBoundary>`

Separate entry point (`vue-error-boundary-kit/async-boundary`) — not part of the core bundle, so it costs nothing if you don't import it. Combines `<Suspense>` and `<ErrorBoundary>`, which today you'd otherwise nest by hand:

```ts
import { AsyncBoundary } from 'vue-error-boundary-kit/async-boundary'
```

```vue
<AsyncBoundary :reset-keys="[userId]">
  <template #default>
    <UserProfile :id="userId" />
    <!-- async setup() / async components allowed -->
  </template>
  <template #loading>
    <Spinner />
  </template>
  <template #fallback="{ error, retry }">
    <ErrorState :message="error.message" @retry="retry" />
  </template>
</AsyncBoundary>
```

It's a composition, not a reimplementation: internally it's `<ErrorBoundary>` wrapping a `<Suspense>`, so it accepts every `<ErrorBoundary>` prop (`resetKeys`, `maxRetries`, `reporter`, `shouldCatch`, …), emits the same `error`/`reset` events, and exposes the same `error`/`hasError`/`retryCount`/`canRetry`/`reset()`/`retry()` via a template ref — all handled by the one `onErrorCaptured` implementation `<ErrorBoundary>` already has. The only thing it adds is the `loading` slot, rendered while the default slot's async dependencies are pending. `retry()`/`reset()` remount the default slot, so a retried async operation genuinely re-runs (the `loading` slot reappears while it does) rather than just re-showing stale state.

### `useErrorBoundary()`

For programmatic use outside a template `<ErrorBoundary>` — e.g. a custom layout-level error state in Nuxt, or registering errors from code that `errorCaptured` never sees:

```ts
const { error, hasError, reset, captureError } = useErrorBoundary({
  onError: (e) => report(e),
  reporter: myReporter,
})

try {
  JSON.parse(untrustedInput)
} catch (err) {
  captureError(err, { source: 'manual', componentName: 'ImportPanel' })
}
```

- `captureError(err, info?)` — registers an error manually; returns the resulting `CapturedError`.
- `reset()` — clears `error` back to `null`.
- `error: ShallowRef<CapturedError | null>`, `hasError: ComputedRef<boolean>`.

Options: `onError`, `beforeReset` (called right before `reset()` clears state), `reporter`, `reportContext`, `internalErrorPrefix` (see the `<ErrorBoundary>` note above — same default, same reasoning, though there's no naming collision risk here since this is a plain composable, not a component with its own `reset` emit).

### `useGlobalErrorCapture()`

Separate entry point (`vue-error-boundary-kit/global-capture`) — not wired up by default, so it costs nothing in bundles that don't import it (including SSR bundles, where it's a no-op if `window` isn't defined). Wires up `window.addEventListener('error', …)` and `unhandledrejection`, funneled through the same reporter/`onError` pattern:

```ts
import { useGlobalErrorCapture } from 'vue-error-boundary-kit/global-capture'

useGlobalErrorCapture({
  reporter: myReporter,
  onError: (e) => console.warn('uncaught:', e),
})
```

Options: `onError`, `reporter`, `reportContext`, `shouldCatch`, `internalErrorPrefix`, `captureErrors` (default `true`), `captureRejections` (default `true`). Returns `{ stop }`; cleanup also runs automatically if called inside an active effect scope (e.g. a component's `setup()`).

### Types

```ts
interface CapturedError {
  error: unknown
  message: string
  stack?: string
  componentName?: string
  lifecycleHook?: string
  source: 'render' | 'async' | 'event' | 'unhandledrejection' | 'manual'
  timestamp: number
}

interface ErrorReporter {
  report(error: CapturedError, context?: Record<string, unknown>): void | Promise<void>
}
```

`source` notes:

- `'render'` — a synchronous failure during a component's render or (sync) `setup()`.
- `'async'` — an `async setup()` that rejects after an `await`. Vue reports both cases with the identical `"setup function"` info string, so this package additionally checks whether the component's own `setup` is an `AsyncFunction` to tell them apart.
- `'event'` — a Vue-compiled `v-on` handler (native DOM event or component `emit`) that throws. Note: Vue *does* route these through `onErrorCaptured` — what it genuinely can't see is covered below.
- `'unhandledrejection'` / and non-Vue `'event'`s — only produced by `useGlobalErrorCapture()`.
- `'manual'` — the default for `captureError()` when no `source` is given.

## Ignoring specific errors

Not every thrown error is a bug worth showing a fallback for — the classic case is a cancelled `fetch`, whose `AbortError` is expected and shouldn't be treated as a component crash. Both `<ErrorBoundary>` and `useGlobalErrorCapture()` accept a `shouldCatch` predicate for this: return `false` and the error passes through completely untouched — no state change, no `error` event, no report, no fallback.

```vue
<ErrorBoundary :should-catch="(e) => e.error?.name !== 'AbortError'">
  <UserProfile :id="userId" />
</ErrorBoundary>
```

For `<ErrorBoundary>`, a rejected predicate doesn't just no-op locally — the error continues through Vue's *own* `onErrorCaptured` propagation, so an ancestor boundary (or the app-level error handler) still gets a chance to see it, exactly as if this boundary weren't in the tree at all. This is different from the `isolate: false` bubbling described below, which is this package's own explicit channel for errors it *did* handle locally.

`useErrorBoundary()` doesn't take a `shouldCatch` — since `captureError()` is called explicitly by your own code, you already control whether to call it.

## Nested boundaries

By default (`isolate: true`) an error is fully absorbed by the nearest `<ErrorBoundary>` — it does not propagate further, matching Vue's own `onErrorCaptured` semantics for a handled error.

With `isolate: false`, after handling the error locally the boundary also pushes it to the nearest ancestor `<ErrorBoundary>` through an internal `provide`/`inject` channel (not through Vue's own `onErrorCaptured` bubbling, which this package deliberately blocks at each level so it can render its own fallback). The ancestor's `error` event fires, its own state updates, and it becomes visible if the ancestor's own fallback would replace the affected content.

A reporter attached to any boundary in the chain is guaranteed to be called **exactly once** per error, even if both the child and the ancestor have reporters configured — the first boundary to actually report it "claims" it, and later boundaries in the chain skip re-reporting the same error instance.

## What `errorCaptured` does and doesn't catch

Vue's `onErrorCaptured` (and therefore `<ErrorBoundary>`) *does* catch:

- Synchronous errors in a descendant's render function or `setup()`.
- Errors in an `async setup()` after an `await` (with or without `<Suspense>`).
- Errors thrown from Vue-compiled `v-on` handlers — both `@click="mayThrow"` on native elements and handlers for component-emitted events.
- Watcher callbacks, directive hooks, transition hooks.

It genuinely does **not** catch:

- Errors in a raw `addEventListener` callback that bypasses Vue's event binding.
- Errors in `setTimeout`/`Promise` chains unrelated to a component's own `async setup()`.
- Unhandled promise rejections.
- Errors thrown inside your own `errorCaptured` handler or reporter — this package guards against that recursion internally (a throwing `onError`/reporter is caught and logged, never re-enters boundary state).
- An error already handled by a descendant boundary with `isolate: false` being reported a second time — see the dedup guarantee above.

Use `useErrorBoundary().captureError()` or `useGlobalErrorCapture()` for the first three.

## Nuxt integration

Nuxt ships its own `<NuxtErrorBoundary>` (wrapping `onErrorCaptured`) and the `error.vue` page for whole-app errors. This package is complementary, not a replacement:

- `<NuxtErrorBoundary>` is a thin, single-purpose wrapper with an `#error` slot and no retry/reset/reporting story of its own — reach for `<ErrorBoundary>` from this package when you want `resetKeys`, `maxRetries`, retry counts, or a reporter attached at the component level.
- `error.vue` handles errors that reach the *app root* (including ones a component-level boundary chose not to isolate, or that happened before any boundary mounted). Keep it as your last line of defense; use `<ErrorBoundary>` for the parts of the tree that should degrade gracefully instead of taking down the page.
- Both rely on the same underlying `onErrorCaptured` mechanism, so the same [catch/no-catch list](#what-errorcaptured-does-and-doesnt-catch) applies either way.

### The `vue-error-boundary-kit/nuxt` module

Add it to `nuxt.config.ts` for auto-registration — no manual imports needed in your app code:

```ts
export default defineNuxtConfig({
  modules: ['vue-error-boundary-kit/nuxt'],
})
```

This registers `<ErrorBoundary>` as a global component and auto-imports `useErrorBoundary`, `useGlobalErrorCapture`, and `useNuxtErrorBoundary` (below) — verified end-to-end against a real Nuxt 4.5.2 app built from the published package tarball, including that `nuxt.config.ts`'s module-options typing actually catches a wrong-shaped option.

Module options (all optional, both default `true`):

```ts
export default defineNuxtConfig({
  modules: ['vue-error-boundary-kit/nuxt'],
  errorBoundaryKit: {
    component: true, // register <ErrorBoundary> globally
    autoImports: true, // auto-import the three composables above
  },
})
```

`@nuxt/kit` is only a peer dependency of this package (`peerDependenciesMeta.optional`), never bundled into your app — it's already part of any Nuxt install, so there's nothing extra to add. Tested against Nuxt 4.5.2; the module's declared `compatibility: { nuxt: '>=3.0.0' }` is reasoned from `@nuxt/kit`'s own cross-major (2/3/4) design rather than independently re-verified against Nuxt 3.

#### `useNuxtErrorBoundary()`

`useErrorBoundary()`, plus Nuxt's own `vue:error` and `app:error` hooks wired in — i.e. it also catches what escapes *every* `<ErrorBoundary>` in your tree (a render/setup error that reached the app root uncaught) and Nuxt's own `showError()`/`createError()` fatal-error flow, neither of which a component-level boundary ever sees. Both hooks run isomorphically, so this covers SSR and the client alike. Typically called once, e.g. in `app.vue`:

```vue
<!-- app.vue -->
<script setup lang="ts">
const { error } = useNuxtErrorBoundary({ reporter: sentryReporter })
</script>

<template>
  <ErrorBoundary :reporter="sentryReporter">
    <NuxtPage />
  </ErrorBoundary>
</template>
```

For errors you want the framework's own `error.vue` to handle (e.g. 404s from `createError()`), don't wrap them in a local boundary — let them propagate.

## vue-router integration

`vue-error-boundary-kit/router` — `useRouterErrorBoundary()`, the `vue-router`-only equivalent of `useNuxtErrorBoundary()`. `router.onError()` is vue-router's own catch-all: it fires for errors thrown in navigation guards, errors passed to `next()`, and errors raised while resolving an async route component (`component: () => import(...)`) — none of which happen inside a component's render/setup lifecycle, so `onErrorCaptured`/`<ErrorBoundary>` structurally never sees them.

```ts
import { useRouterErrorBoundary } from 'vue-error-boundary-kit/router'
```

```vue
<!-- App.vue -->
<script setup lang="ts">
const { error } = useRouterErrorBoundary({ reporter: sentryReporter })
</script>
```

Same options as `useErrorBoundary()` (`onError`, `beforeReset`, `reporter`, `reportContext`, `internalErrorPrefix`); unsubscribes from `router.onError()` automatically on scope dispose. `vue-router` is an optional peer dependency, never bundled unless you import this entry point. Verified against a real `router.onError()` — both a throwing navigation guard and a rejected async route component were confirmed to actually reach it, against `vue-router@5.2.0`; the declared `peerDependencies` range (`^4.0.0 || ^5.0.0`) is reasoned from `onError`'s stable, long-standing signature rather than independently re-verified against 4.x.

## Reporting adapters

Each adapter is its own `exports` entry point, so an adapter you don't import never reaches your bundle.

```ts
import { createConsoleReporter } from 'vue-error-boundary-kit/adapters/console'
import { createHttpReporter } from 'vue-error-boundary-kit/adapters/http'
import { createSentryReporter } from 'vue-error-boundary-kit/adapters/sentry'
import { createBugsnagReporter } from 'vue-error-boundary-kit/adapters/bugsnag'
import { createLogRocketReporter } from 'vue-error-boundary-kit/adapters/logrocket'
import { createOtelReporter } from 'vue-error-boundary-kit/adapters/otel'
```

- **`adapters/console`** — `createConsoleReporter({ logger?, prefix? })`, plus a ready-made `consoleReporter` instance. Logs via `console.error` by default; good dev-mode default. Messages are prefixed with `[vue-error-boundary-kit]` — pass `prefix: '[my-app]'` to rebrand it, or `prefix: ''` to drop it.
- **`adapters/http`** — `createHttpReporter({ endpoint, batchInterval?, maxBatchSize?, headers?, serialize? })`. POSTs via `fetch` (batched if `batchInterval > 0`); a `pagehide` listener force-flushes any pending batch via `navigator.sendBeacon`, since an in-flight `fetch` can be aborted when the page is actually closing.
- **`adapters/sentry`** — `createSentryReporter({ client, tags? })`. `@sentry/vue` is never imported by this package — pass in your own already-initialized Sentry client (anything with a `captureException(error, hint?)` method); this stays a thin, structurally-typed wrapper.
- **`adapters/bugsnag`** — `createBugsnagReporter({ client, severity? })`. Wraps `Bugsnag.notify(error, onError)`, setting `event.context`/`event.severity` and attaching an `errorBoundary` metadata section via `event.addMetadata(...)`. `@bugsnag/js` is never imported — pass in your own initialized client.
- **`adapters/logrocket`** — `createLogRocketReporter({ client, tags? })`. Wraps `LogRocket.captureException(error, { tags, extra })`; since LogRocket requires scalar `extra` values, non-scalar context is `JSON.stringify`'d automatically. `logrocket` is never imported — pass in your own initialized client.
- **`adapters/otel`** — `createOtelReporter({ tracer, spanName?, attributes? })`. Starts a span per error via your own already-initialized OTel `Tracer` (e.g. `trace.getTracer('my-app')`), calls `recordException()` + `setStatus({ code: ERROR })`, attaches the `CapturedError` fields as span attributes, then ends the span. `@opentelemetry/api` is never imported — pass in your own tracer. Want errors attached to the *current* span instead of a fresh one? Pass `{ startSpan: () => trace.getActiveSpan() ?? realTracer.startSpan(name) }` as the `tracer`.

All six destination adapters accept a `CapturedError` and forward it somewhere; you can pass a reporter (or an array) to any `<ErrorBoundary>`, to `useErrorBoundary()`, or to `useGlobalErrorCapture()`.

## Rate-limiting & dedup

`adapters/rate-limit` wraps any reporter(s) to protect them from a mass-failure storm — e.g. a broken list re-rendering hundreds of times a second, which would otherwise spam Sentry/HTTP/etc. with near-identical reports:

```ts
import { createRateLimitedReporter } from 'vue-error-boundary-kit/adapters/rate-limit'

const reporter = createRateLimitedReporter([sentryReporter, consoleReporter], {
  maxPerWindow: 10, // at most 10 reports forwarded per window (default: 10)
  windowMs: 10_000, // window size (default: 10s)
  dedupWindowMs: 10_000, // suppress identical repeats within this window (default: windowMs)
  onSuppressed: (error, { reason, count }) => {
    // reason: 'dedup' | 'rate-limit'
  },
  internalErrorPrefix: '[vue-error-boundary-kit]', // safety-net log if onSuppressed/a wrapped reporter throws; '' to omit
})
```

"Identical" means the same `source` + `componentName` + `message`. This is itself an `ErrorReporter`, so it composes with everything else — pass it wherever you'd pass any other reporter.

## Breadcrumbs

`adapters/breadcrumbs` — a rolling window of "things that happened before the error", attached to reports automatically. Nothing is auto-instrumented: call `addBreadcrumb()` yourself from wherever you already have the information (a router hook, a click handler, a state-management action) — the same opt-in spirit as `useGlobalErrorCapture()`.

```ts
import { createBreadcrumbTrail, withBreadcrumbs } from 'vue-error-boundary-kit/adapters/breadcrumbs'

const trail = createBreadcrumbTrail({ limit: 20 })

router.afterEach((to) => {
  trail.addBreadcrumb({ category: 'navigation', message: `→ ${to.fullPath}` })
})

const reporter = withBreadcrumbs(sentryReporter, { trail })
```

```vue
<ErrorBoundary :reporter="[reporter, trail.record]">…</ErrorBoundary>
```

- `createBreadcrumbTrail({ limit? })` — `entries` (chronological, oldest first — the reverse of `createErrorHistory()`'s most-recent-first, matching how breadcrumbs read as a timeline elsewhere), `addBreadcrumb({ category, message, timestamp?, data? })`, `clear()`, and `record` — itself an `ErrorReporter`, so passing it alongside your real reporter(s) auto-adds every captured error to the trail too, meaning a later error's breadcrumbs include earlier ones.
- `withBreadcrumbs(reporter, { trail, contextKey?, internalErrorPrefix? })` — wraps any reporter(s) so every `report()` call's `context` includes the trail's current entries under `contextKey` (default: `'breadcrumbs'`).

## TanStack Query integration

`<ErrorBoundary>`'s `retry()`/`reset()` only re-render the tree. A `useQuery()` that already failed doesn't care — it stays in its cached error state and, with `throwOnError` set, re-throws that same stale error on the very next render, before its query function ever runs again. `@tanstack/react-query` solves this with `QueryErrorResetBoundary`; `@tanstack/vue-query` has no equivalent primitive, so `vue-error-boundary-kit/tanstack-query` provides one:

```ts
import { useQueryErrorReset } from 'vue-error-boundary-kit/tanstack-query'
```

```vue
<script setup lang="ts">
const resetErroredQueries = useQueryErrorReset()
</script>

<template>
  <ErrorBoundary :before-reset="resetErroredQueries">
    <template #default>
      <UserProfile :id="userId" />
      <!-- uses useQuery({ ..., throwOnError: true }) -->
    </template>
    <template #fallback="{ error, retry }">
      <ErrorState :message="error.message" @retry="retry" />
    </template>
  </ErrorBoundary>
</template>
```

`useQueryErrorReset(options?)` returns a synchronous callback that resets every query currently in an error state (`queryClient.resetQueries({ predicate: (query) => query.state.status === 'error' })`) — wire it into `beforeReset` so it runs right before the boundary's own re-render, and the retried query actually refetches instead of instantly failing again. Options: `queryClient` (default: `useQueryClient()` from context), `id` (forwarded to `useQueryClient()` for multi-client setups), `internalErrorPrefix`. `@tanstack/vue-query` is an optional peer dependency — never imported unless you import this entry point.

## Debugging: error history

`/devtools` — not a Vue Devtools browser-extension integration, but a small, dependency-free in-memory history you can drop into a page during development:

```ts
import { createErrorHistory, ErrorHistoryPanel } from 'vue-error-boundary-kit/devtools'

const history = createErrorHistory({ limit: 50 })
```

```vue
<ErrorBoundary :reporter="[sentryReporter, history.record]">…</ErrorBoundary>

<ErrorHistoryPanel v-if="isDev" :history="history" />
```

`history.record` is itself an `ErrorReporter` — it rides the existing reporter mechanism, so no other wiring is needed. `history.entries` is a reactive, most-recent-first array (capped at `limit`, default 50); `<ErrorHistoryPanel>` is an optional, dependency-free component that renders it (inline-styled, no separate CSS import needed) with a "Clear" button.

> **Why not a real Vue Devtools extension integration?** Considered and declined. `@vue/devtools-api` isn't dependency-free itself — it pulls in `@vue/devtools-kit` and its own dependency tree, and a minimal bundled `setupDevtoolsPlugin()` call measures ~20 kB gzip on its own, over 9× this package's entire core budget (~2.1 kB gzip). Unlike the Sentry/Bugsnag/LogRocket adapters, there's no way to depend on it "structurally" without bundling it — a devtools inspector has no already-initialized external client to defer to. `<ErrorHistoryPanel>` covers the same debugging need without that cost, and without requiring the extension to be installed at all.

> **What about a custom Nuxt DevTools tab (`@nuxt/devtools-kit`)?** Also considered and declined — not the same thing as the browser-extension question above, but the same conclusion. `addCustomTab()` is real and would cost nothing in production (it only runs inside `nuxi dev`), but `createErrorHistory()`'s reactive state lives in the *browser* app instance, while a devtools tab is registered from the module's `setup()`, which runs in *Node.js*. The only view type that supports live data (`iframe`, pointed at a served dev-server route) needs its own client↔devtools-server RPC bridge (`extendServerRpc`/`iframe-client`) — a small SPA and protocol of its own, not a quick addition — and the ecosystem is mid-major-version-transition (`@nuxt/devtools-kit`'s `latest` on npm is currently a `4.0.0-alpha`; the stable line is `3.4.1`). `<ErrorHistoryPanel>` already covers the same need everywhere, DevTools open or not.

## Testing your app

`vue-error-boundary-kit/testing` — test doubles and fixtures for exercising code that uses `<ErrorBoundary>`/`useErrorBoundary()`/an adapter, framework-agnostic beyond Vue itself (no `vi.fn()`/`jest.fn()` dependency baked in, so it works the same under Vitest or Jest):

```ts
import {
  ThrowInRender, // throws in render() when `shouldThrow` (default true); prop `message`
  ThrowInSetup, // throws synchronously in setup() — source: 'render'
  ThrowInAsyncSetup, // throws after an await in an async setup() — source: 'async'; render inside <Suspense>/<AsyncBoundary>
  ThrowAbortError, // throws an AbortError DOMException, matching a cancelled fetch()
  makeCapturedError, // build a CapturedError fixture for a reporter/adapter unit test
  createRecordingReporter, // an ErrorReporter test double: { calls, report(), reset() }
} from 'vue-error-boundary-kit/testing'
```

```ts
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import { ErrorBoundary } from 'vue-error-boundary-kit'
import { ThrowInRender, createRecordingReporter } from 'vue-error-boundary-kit/testing'

const reporter = createRecordingReporter()
const wrapper = mount(ErrorBoundary, {
  props: { reporter },
  slots: {
    default: () => h(ThrowInRender, { message: 'boom' }),
    fallback: ({ error }) => h('div', { class: 'fallback' }, error.message),
  },
})
await nextTick() // onErrorCaptured sets reactive state synchronously; the DOM swap is not

expect(wrapper.find('.fallback').text()).toBe('boom')
expect(reporter.calls[0]?.error.source).toBe('render')
```

## SSR notes

`<ErrorBoundary>` is SSR-safe in the sense that matters most: a failing subtree never crashes `renderToString` or turns into a full 500 page, and error events/reporters fire correctly on the server exactly like on the client.

There is one honest limitation worth knowing, rooted in how Vue's SSR renderer works rather than in this package: on the client, `onErrorCaptured` setting reactive state triggers a genuine second render pass, so the fallback slot's markup replaces the failed content. Vue's server renderer has no equivalent "re-render" step — a component's `render()` has already returned by the time a descendant's failure is caught, so the server HTML for that specific position comes out as an empty placeholder rather than the fallback slot's own markup. Achieving pixel-perfect SSR fallback HTML would require either internal renderer APIs or re-executing the failing subtree's `setup()` a second time — both of which this package deliberately avoids (see [Vapor-mode readiness](#comparison) below).

This was verified empirically, not just assumed: wrapping the default slot in `<Suspense>` doesn't change the outcome either, for both a synchronous throw and a rejected async `setup()` — `<Suspense>`'s SSR buffering only defers *unresolved* async dependencies so it can commit its `#default` branch once they settle; it has no mechanism, public or private, to commit its `#fallback` branch when a dependency *rejects* instead. A bare `<Suspense>` with no error boundary around it at all, whose `#default` branch's `setup()` rejects, still serializes to an empty placeholder — confirming this isn't specific to how this package uses `onErrorCaptured`.

What *is* guaranteed, and covered by tests:

- `renderToString` never throws for a failure inside a boundary.
- Sibling content renders normally around the failed subtree.
- The `error` event and any configured reporter fire exactly once, on the server, just like on the client.
- Hydration always converges on correct, interactive client-side content — even if the server and client end up disagreeing about whether a given subtree failed (e.g. a fetch that failed only on the server has since succeeded by the time the client hydrates). Vue's own hydration-mismatch recovery may log its standard dev-only warning in that disagreement case (stripped from production builds); the end state is always correct.

## Comparison

| | Plain `onErrorCaptured` | `<NuxtErrorBoundary>` | `vue-error-boundary-kit` |
|---|---|---|---|
| Fallback UI | you build it every time | `#error` slot | `fallback` scoped slot: `error`, `reset`, `retry`, `retryCount`, `canRetry` |
| Retry / reset | manual | manual | `resetKeys`, `resetOnPropsChange`, `maxRetries` built in; `retry-backoff`'s `createBackoffRetry()` for increasing delay between attempts |
| Reporting | manual | manual | adapter pattern (`console`/`http`/`sentry`/`bugsnag`/`logrocket`/`otel`), tree-shaken per adapter, exactly-once across nested boundaries |
| Mass-failure protection | — | — | `adapters/rate-limit` — dedup + rate-limit wrapper for any reporter |
| Breadcrumbs | — | — | `adapters/breadcrumbs` — rolling event trail, opt-in, attached to reports via `withBreadcrumbs()` |
| TanStack Query retry | manual `resetQueries()` wiring | manual `resetQueries()` wiring | `tanstack-query`'s `useQueryErrorReset()` — one call, wired into `beforeReset` |
| Debug history | — | — | `/devtools` — `createErrorHistory()` + `<ErrorHistoryPanel>` |
| Programmatic use | — | — | `useErrorBoundary()` |
| Beyond `errorCaptured` | — | — | `useGlobalErrorCapture()` (opt-in, separate entry point) |
| Nuxt module | — | is one | `vue-error-boundary-kit/nuxt` — auto-registers `<ErrorBoundary>` + auto-imports; `useNuxtErrorBoundary()` also catches what escapes every boundary via Nuxt's own `vue:error`/`app:error` hooks |
| vue-router errors | not seen by `onErrorCaptured` at all | not seen by `onErrorCaptured` at all | `router`'s `useRouterErrorBoundary()` — catches navigation-guard and async-route-component errors via `router.onError()` |
| Testing helpers | you build them every time | you build them every time | `vue-error-boundary-kit/testing` — throw-on-demand components, a `CapturedError` fixture builder, a framework-agnostic recording reporter |
| Suspense + error boundary combined | you nest `<Suspense>` and your own boundary by hand | you nest `<Suspense>` and `<NuxtErrorBoundary>` by hand | `async-boundary`'s `<AsyncBoundary>` — one component, `default`/`loading`/`fallback` slots |
| SSR | works, no fallback swap | works, no fallback swap | works, no fallback swap *(see [SSR notes](#ssr-notes) — this is a Vue architecture limit, not specific to any of these)* |
| Bundle cost | 0 | part of Nuxt | ~2.1 kB gzip core; adapters/devtools are separate entry points |
| Vapor-mode readiness | N/A | depends on Nuxt | only uses official `onErrorCaptured`/`h()` — no internal VDOM renderer APIs |

Not in v1: a full Vue Devtools browser-extension custom inspector (the in-app `<ErrorHistoryPanel>` above covers the same need without adding `@vue/devtools-api` as a dependency).

---

## License

MIT

---

## Author

Danil Lisin Vladimirovich aka Macrulez

GitHub: [macrulezru](https://github.com/macrulezru) · Website: [macrulez.ru/en](https://macrulez.ru/en)

Questions and bugs — [issues](https://github.com/macrulezru/vue-error-boundary-kit/issues)

---

## 💖 Support the project

Open source takes time and effort. If my work saves you time or brings value, consider supporting further development.

<a href="https://donate.cryptocloud.plus/M6O34NIN" target="_blank">
  <img src="https://img.shields.io/badge/Donate-CryptoCloud-8A2BE2?style=for-the-badge&logo=cryptocurrency&logoColor=white" alt="Donate via CryptoCloud">
</a>

Thank you for being part of this journey. ❤️
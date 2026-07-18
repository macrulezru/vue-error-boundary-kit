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

Production-ready error boundaries for Vue 3 — a declarative `<ErrorBoundary>` component, a `useErrorBoundary()` composable for programmatic use, and an adapter-based reporting layer (Sentry / Bugsnag / LogRocket / plain HTTP) that isn't hard-baked into the core.

Zero runtime dependencies beyond Vue itself. Core bundle (`<ErrorBoundary>` + `useErrorBoundary`) is ~1.8 kB gzip; every reporting adapter is its own entry point and only ships if you import it.

---

## Contents

- [The problem](#the-problem)
- [Quick start](#quick-start)
- [API reference](#api-reference)
  - [`<ErrorBoundary>`](#errorboundary)
  - [`useErrorBoundary()`](#useerrorboundary)
  - [`useGlobalErrorCapture()`](#useglobalerrorcapture)
  - [Types](#types)
- [Ignoring specific errors](#ignoring-specific-errors)
- [Nested boundaries](#nested-boundaries)
- [What `errorCaptured` does and doesn't catch](#what-errorcaptured-does-and-doesnt-catch)
- [Nuxt integration](#nuxt-integration)
- [Reporting adapters](#reporting-adapters)
- [Rate-limiting & dedup](#rate-limiting--dedup)
- [Debugging: error history](#debugging-error-history)
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

```vue
<!-- app.vue -->
<template>
  <ErrorBoundary :reporter="sentryReporter">
    <NuxtPage />
  </ErrorBoundary>
</template>
```

For errors you want the framework's own `error.vue` to handle (e.g. 404s from `createError()`), don't wrap them in a local boundary — let them propagate.

## Reporting adapters

Each adapter is its own `exports` entry point, so an adapter you don't import never reaches your bundle.

```ts
import { createConsoleReporter } from 'vue-error-boundary-kit/adapters/console'
import { createHttpReporter } from 'vue-error-boundary-kit/adapters/http'
import { createSentryReporter } from 'vue-error-boundary-kit/adapters/sentry'
import { createBugsnagReporter } from 'vue-error-boundary-kit/adapters/bugsnag'
import { createLogRocketReporter } from 'vue-error-boundary-kit/adapters/logrocket'
```

- **`adapters/console`** — `createConsoleReporter({ logger?, prefix? })`, plus a ready-made `consoleReporter` instance. Logs via `console.error` by default; good dev-mode default. Messages are prefixed with `[vue-error-boundary-kit]` — pass `prefix: '[my-app]'` to rebrand it, or `prefix: ''` to drop it.
- **`adapters/http`** — `createHttpReporter({ endpoint, batchInterval?, maxBatchSize?, headers?, serialize? })`. POSTs via `fetch` (batched if `batchInterval > 0`); a `pagehide` listener force-flushes any pending batch via `navigator.sendBeacon`, since an in-flight `fetch` can be aborted when the page is actually closing.
- **`adapters/sentry`** — `createSentryReporter({ client, tags? })`. `@sentry/vue` is never imported by this package — pass in your own already-initialized Sentry client (anything with a `captureException(error, hint?)` method); this stays a thin, structurally-typed wrapper.
- **`adapters/bugsnag`** — `createBugsnagReporter({ client, severity? })`. Wraps `Bugsnag.notify(error, onError)`, setting `event.context`/`event.severity` and attaching an `errorBoundary` metadata section via `event.addMetadata(...)`. `@bugsnag/js` is never imported — pass in your own initialized client.
- **`adapters/logrocket`** — `createLogRocketReporter({ client, tags? })`. Wraps `LogRocket.captureException(error, { tags, extra })`; since LogRocket requires scalar `extra` values, non-scalar context is `JSON.stringify`'d automatically. `logrocket` is never imported — pass in your own initialized client.

All five destination adapters accept a `CapturedError` and forward it somewhere; you can pass a reporter (or an array) to any `<ErrorBoundary>`, to `useErrorBoundary()`, or to `useGlobalErrorCapture()`.

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

## Debugging: error history

`/devtools` — not a Vue Devtools browser-extension integration (that would need `@vue/devtools-api` as a real dependency, which conflicts with this package's zero-dependency core) but a small, dependency-free in-memory history you can drop into a page during development:

```ts
import { createErrorHistory, ErrorHistoryPanel } from 'vue-error-boundary-kit/devtools'

const history = createErrorHistory({ limit: 50 })
```

```vue
<ErrorBoundary :reporter="[sentryReporter, history.record]">…</ErrorBoundary>

<ErrorHistoryPanel v-if="isDev" :history="history" />
```

`history.record` is itself an `ErrorReporter` — it rides the existing reporter mechanism, so no other wiring is needed. `history.entries` is a reactive, most-recent-first array (capped at `limit`, default 50); `<ErrorHistoryPanel>` is an optional, dependency-free component that renders it (inline-styled, no separate CSS import needed) with a "Clear" button.

## SSR notes

`<ErrorBoundary>` is SSR-safe in the sense that matters most: a failing subtree never crashes `renderToString` or turns into a full 500 page, and error events/reporters fire correctly on the server exactly like on the client.

There is one honest limitation worth knowing, rooted in how Vue's SSR renderer works rather than in this package: on the client, `onErrorCaptured` setting reactive state triggers a genuine second render pass, so the fallback slot's markup replaces the failed content. Vue's server renderer has no equivalent "re-render" step — a component's `render()` has already returned by the time a descendant's failure is caught, so the server HTML for that specific position comes out as an empty placeholder rather than the fallback slot's own markup. Achieving pixel-perfect SSR fallback HTML would require either internal renderer APIs or re-executing the failing subtree's `setup()` a second time — both of which this package deliberately avoids (see [Vapor-mode readiness](#comparison) below).

What *is* guaranteed, and covered by tests:

- `renderToString` never throws for a failure inside a boundary.
- Sibling content renders normally around the failed subtree.
- The `error` event and any configured reporter fire exactly once, on the server, just like on the client.
- Hydration always converges on correct, interactive client-side content — even if the server and client end up disagreeing about whether a given subtree failed (e.g. a fetch that failed only on the server has since succeeded by the time the client hydrates). Vue's own hydration-mismatch recovery may log its standard dev-only warning in that disagreement case (stripped from production builds); the end state is always correct.

## Comparison

| | Plain `onErrorCaptured` | `<NuxtErrorBoundary>` | `vue-error-boundary-kit` |
|---|---|---|---|
| Fallback UI | you build it every time | `#error` slot | `fallback` scoped slot: `error`, `reset`, `retry`, `retryCount`, `canRetry` |
| Retry / reset | manual | manual | `resetKeys`, `resetOnPropsChange`, `maxRetries` built in |
| Reporting | manual | manual | adapter pattern (`console`/`http`/`sentry`/`bugsnag`/`logrocket`), tree-shaken per adapter, exactly-once across nested boundaries |
| Mass-failure protection | — | — | `adapters/rate-limit` — dedup + rate-limit wrapper for any reporter |
| Debug history | — | — | `/devtools` — `createErrorHistory()` + `<ErrorHistoryPanel>` |
| Programmatic use | — | — | `useErrorBoundary()` |
| Beyond `errorCaptured` | — | — | `useGlobalErrorCapture()` (opt-in, separate entry point) |
| SSR | works, no fallback swap | works, no fallback swap | works, no fallback swap *(see [SSR notes](#ssr-notes) — this is a Vue architecture limit, not specific to any of these)* |
| Bundle cost | 0 | part of Nuxt | ~1.8 kB gzip core; adapters/devtools are separate entry points |
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
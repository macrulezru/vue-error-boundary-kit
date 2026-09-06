# **Error Boundary Kit**

![Error Boundary Kit](https://github.com/macrulezru/assets/blob/master/packages-images/vue-error-boundary-kit.png?raw=true)

Production-ready error boundaries for Vue 3 — a declarative `<ErrorBoundary>` component, a `useErrorBoundary()` composable for programmatic use, and an adapter-based reporting layer (Sentry / Bugsnag / LogRocket / plain HTTP) that isn't hard-baked into the core.

Zero runtime dependencies beyond Vue itself. Core bundle (`<ErrorBoundary>` + `useErrorBoundary`) is ~2.1 kB gzip; every reporting adapter is its own entry point and only ships if you import it.

---

## Features

- **`<ErrorBoundary>`** — declarative component with a `fallback` slot, retry, reset, and `resetKeys`-driven auto-reset
- **`<AsyncBoundary>`** — combines `<Suspense>` and `<ErrorBoundary>` in one component, adding a `loading` slot; separate entry point, costs nothing unless imported
- **`useErrorBoundary()`** — programmatic use outside a template boundary, with an explicit `captureError()`
- **`useGlobalErrorCapture()`** — opt-in separate entry point for what `errorCaptured` structurally cannot see: raw event-listener callbacks, timers, unhandled promise rejections
- **Retry with backoff** — `vue-error-boundary-kit/retry-backoff` wraps a boundary's `retry()` with an increasing delay for transient/network failures
- **Reporting adapters** — six ready-made adapters (console, HTTP, Sentry, Bugsnag, LogRocket, OpenTelemetry), each its own entry point that only ships if imported
- **Rate-limiting & dedup** — `adapters/rate-limit` wraps any reporter(s) to cap and deduplicate reports during a mass-failure storm
- **Breadcrumbs** — a rolling window of "things that happened before the error", attached to reports automatically once wired in
- **Nested boundaries** — `isolate: false` lets a locally-handled error also bubble to the nearest ancestor boundary; a reporter is guaranteed to fire exactly once even across the chain
- **`shouldCatch`** — let specific errors (e.g. a cancelled fetch's `AbortError`) pass through a boundary completely untouched
- **Nuxt module** — `vue-error-boundary-kit/nuxt` auto-registers `<ErrorBoundary>` and auto-imports the composables; `useNuxtErrorBoundary()` also catches Nuxt's own `vue:error`/`app:error` hooks
- **Vue Router integration** — `useRouterErrorBoundary()` catches errors `onErrorCaptured` structurally never sees: navigation guards, `next()`, async route components
- **TanStack Query integration** — `useQueryErrorReset()` resets errored queries before a retry, so a retried query actually refetches instead of instantly failing again
- **Debug error history** — the dependency-free `/devtools` entry point's `createErrorHistory()` + `<ErrorHistoryPanel>`, roughly 9× lighter than a real Vue Devtools integration
- **Testing utilities** — `/testing` entry point with throw-fixtures and a recording reporter test double, framework-agnostic beyond Vue itself
- **SSR-safe** — a failing subtree never crashes `renderToString`; error events and reporters fire correctly on the server; hydration always converges on correct client content
- **Zero runtime dependencies beyond Vue** — every feature past the core boundary is its own tree-shakeable entry point

---

## When you'd reach for this

One unhandled throw deep in the component tree turns the whole app into a blank screen for the user — vue-error-boundary-kit limits the blast radius to a single widget instead of the entire page.

- **A single broken widget shouldn't take down the page** — Wrap a product card, a comment section, or a dashboard widget in its own protective boundary — if it crashes, the widgets around it keep working instead of turning into the same blank screen.
- **The error happens outside render, not inside it** — A component's own error handling structurally can't see exceptions from click handlers, timers, or unhandled promise rejections — those need a separate, global catch.
- **Not every error deserves the same response** — A flaky network request deserves a delayed retry, while a logic error deserves being surfaced to the user and stopped right away. The boundary can be configured to tell the two apart on its own, instead of blindly retrying something that was never going to succeed.
- **Errors shouldn't only live in the dev console** — Pluggable adapters send errors to Sentry, Bugsnag, or your own HTTP endpoint, and a built-in DevTools history shows what broke before a user has to file a ticket about it.

---

## The problem

React has had error boundaries as a first-class pattern for years. Vue 3 only gives you the low-level `onErrorCaptured` hook — every project ends up re-inventing a fallback-UI component with retry and error reporting around it. This package is that component, done once, with:

- a declarative `<ErrorBoundary>` with a `fallback` slot and retry;
- `useErrorBoundary()` for programmatic use outside a template boundary;
- a single adapter-based error-reporting mechanism (Sentry / Bugsnag / custom `fetch` — no hard dependency);
- `useGlobalErrorCapture()`, an opt-in separate entry point for what `errorCaptured` structurally cannot see (raw event-listener callbacks, timers, unhandled promise rejections).

---

## Installation

| Environment           | Minimum version                                                  |
| --------------------- | ---------------------------------------------------------------- |
| Vue                   | `3.4.0+`                                                         |
| Node.js               | `^20.19.0` or `>=22.12.0`                                        |
| `@nuxt/kit`           | `3.0.0+` (optional — only for the `/nuxt` module)                |
| `vue-router`          | `4.0.0+` (optional — only for the `/router` integration)         |
| `@tanstack/vue-query` | `5.0.0+` (optional — only for the `/tanstack-query` integration) |

```bash
npm install vue-error-boundary-kit
```

### Quick start

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

### More examples

#### Manual capture outside a template

`useErrorBoundary()` catches what `errorCaptured` simply can't see — an error thrown inside an event handler, say, or while parsing untrusted data.

```ts
import { useErrorBoundary } from 'vue-error-boundary-kit'

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

#### Protection from a storm of identical error reports

`createRateLimitedReporter` wraps any reporters and caps duplicates and bursts on its own — a broken list re-rendering hundreds of times a second won't flood Sentry with near-identical events.

```ts
import { createSentryReporter } from 'vue-error-boundary-kit/adapters/sentry'
import { createRateLimitedReporter } from 'vue-error-boundary-kit/adapters/rate-limit'

const sentryReporter = createSentryReporter({ client: sentryClient })

const reporter = createRateLimitedReporter([sentryReporter], {
  maxPerWindow: 10, // at most 10 reports forwarded per 10s window
  dedupWindowMs: 10_000, // suppress identical repeats within this window
})

// Pass `reporter` to <ErrorBoundary>, useErrorBoundary(), or
// useGlobalErrorCapture() — it composes with everything else, same as any
// other ErrorReporter.
```

---

## Documentation & links

- 📖 **Full documentation:** [npm.vuecraft.ru/en/packages/vue-error-boundary-kit](https://npm.vuecraft.ru/en/packages/vue-error-boundary-kit/guide/overview.html)
- 🌐 **VueCraft:** [vuecraft.ru/en](https://vuecraft.ru/en)
- 👤 **Author:** [macrulez.ru/en](https://macrulez.ru/en)
- 💻 **GitHub:** [macrulezru/vue-error-boundary-kit](https://github.com/macrulezru/vue-error-boundary-kit)
- 📦 **NPM:** [vue-error-boundary-kit](https://www.npmjs.com/package/vue-error-boundary-kit)
- 🐛 **Issues:** [github.com/macrulezru/vue-error-boundary-kit/issues](https://github.com/macrulezru/vue-error-boundary-kit/issues)

---

## License

MIT

---

## 💖 Support the project

Open source takes time and effort. If this library saves you time or brings value, consider supporting further development.

<a href="https://donate.cryptocloud.plus/M6O34NIN" target="_blank">
  <img src="https://img.shields.io/badge/Donate-CryptoCloud-8A2BE2?style=for-the-badge&logo=cryptocurrency&logoColor=white" alt="Donate via CryptoCloud">
</a>

Thank you for being part of this journey. ❤️

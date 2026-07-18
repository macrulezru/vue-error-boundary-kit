# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.0] - 2026-07-18

### Added

- `<ErrorBoundary>` component — `default`/`fallback` scoped slots (`error`, `reset`, `retry`, `retryCount`, `canRetry`), `resetKeys`, `resetOnPropsChange`, `maxRetries`, `isolate`, `reporter`, `shouldCatch`, `beforeReset`, `internalErrorPrefix`
- `error`/`reset` events; boundary state also exposed via a template ref (`reset()`, `retry()`, `error`, `hasError`, `retryCount`, `canRetry`) for use outside the fallback slot
- `useErrorBoundary()` composable for programmatic error state (`error`, `hasError`, `reset()`, `captureError()`) outside a template boundary
- `useGlobalErrorCapture()` — separate `/global-capture` entry point for uncaught `window` errors and unhandled promise rejections; not wired up by default
- `shouldCatch` predicate on `<ErrorBoundary>` and `useGlobalErrorCapture()` — let specific errors (e.g. a cancelled fetch's `AbortError`) pass through untouched instead of being treated as a failure
- Reporting adapters, each its own tree-shakeable entry point: `/adapters/console` (customizable `prefix`, default `[vue-error-boundary-kit]`), `/adapters/http` (batched, `navigator.sendBeacon` fallback on `pagehide`), `/adapters/sentry`, `/adapters/bugsnag`, `/adapters/logrocket` (all structurally-typed wrappers — none of `@sentry/vue`, `@bugsnag/js`, or `logrocket` are dependencies of this package)
- `/adapters/rate-limit` — `createRateLimitedReporter()` wraps any reporter(s) with dedup (same source + componentName + message within a window) and a max-reports-per-window cap, for mass-failure scenarios (e.g. a broken list re-rendering hundreds of times a second)
- `/devtools` — `createErrorHistory()` (a reactive, capped in-memory error history that plugs in via the existing reporter mechanism) and `<ErrorHistoryPanel>`, a dependency-free, inline-styled component to render it. Not a Vue Devtools browser-extension integration — that would require `@vue/devtools-api` as a dependency, which this package's zero-dependency core rules out
- Exactly-once reporting guarantee across nested boundaries, regardless of how many boundaries in the chain have a reporter configured
- `CapturedError`/`ErrorReporter` public types; `source` distinguishes `'render'` vs `'async'` setup failures by checking whether the component's own `setup` is an `AsyncFunction` (Vue reports both with the identical `"setup function"` info string)
- SSR-safe: a failing subtree never crashes `renderToString`, reporting/events fire correctly on the server, hydration always converges on correct interactive client content — see README's SSR notes for the one honest limitation (no in-place fallback swap in the initial server HTML — a Vue 3 SSR architecture constraint, not fixable without internal renderer APIs)
- `internalErrorPrefix` option on `<ErrorBoundary>`, `useErrorBoundary()`, `useGlobalErrorCapture()`, and `createRateLimitedReporter()` — customizes (or, with `''`, removes) the `[vue-error-boundary-kit]` prefix on the internal safety-net log emitted when your own `onError`/`beforeReset`/reporter/`onSuppressed` itself throws
- Zero runtime dependencies beyond `vue` (peer, `^3.4.0`); core bundle ~1.8 kB gzip
- Interactive demo app (`demo/`) covering every feature

### Changed

- **Package renamed from `@macrulez/vue-error-boundary-kit` to unscoped `vue-error-boundary-kit`** before this ever shipped — the unscoped name was free on the registry (verified via `npm view`), and dropping the scope avoids the `publishConfig.access: public` requirement scoped packages need to publish outside a paid org.

### Fixed

- **`<ErrorBoundary>`'s reset callback prop renamed `onReset` → `beforeReset`** before this ever shipped. The original name collided with Vue's own auto-derived listener prop for this component's `reset` emit: Vue's `emit('reset')` looks up and calls `props.onReset` regardless of whether that key is a "real" declared prop, so a user-supplied `onReset` prop was being invoked *twice* per reset — once via this package's own (safely wrapped) call, and once more by Vue's `emit()` internals, **outside** this package's try/catch. A throwing `onReset` would therefore escape as an unhandled rejection instead of being caught by the internal recursion guard, undermining the exact guarantee §8 of the spec calls for. Caught by a test written while adding `internalErrorPrefix` coverage. `useErrorBoundary()`'s equivalent option was renamed too, for consistency — it was never affected by the bug (composables don't go through Vue's `emit()`), but keeping the two option names aligned avoids a confusing asymmetry between the two APIs.

# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- `vue-error-boundary-kit/nuxt` — a real Nuxt module (`defineNuxtModule`), not just documentation: auto-registers `<ErrorBoundary>` as a global component and auto-imports `useErrorBoundary`/`useGlobalErrorCapture`/`useNuxtErrorBoundary` (`component`/`autoImports` options, both default `true`). `@nuxt/kit` is an optional peer dependency, never bundled — Nuxt itself always has it available. Verified end-to-end against a real Nuxt 4.5.2 app built from the published package tarball (`npm pack` → install → `nuxi prepare`), including that `nuxt.config.ts`'s `errorBoundaryKit` option is actually type-checked (proven with a deliberate `@ts-expect-error` + negative control)
- `useNuxtErrorBoundary()` (`vue-error-boundary-kit/nuxt/runtime`) — `useErrorBoundary()` wired to Nuxt's own `vue:error`/`app:error` hooks, so it also catches what escapes every `<ErrorBoundary>` in the tree and Nuxt's own `showError()`/`createError()` flow, isomorphically (SSR + client)
- `vue-error-boundary-kit/tanstack-query` — `useQueryErrorReset()`, the Vue-Query equivalent of `@tanstack/react-query`'s `QueryErrorResetBoundary` (which `@tanstack/vue-query` doesn't ship): resets every currently-errored query via `queryClient.resetQueries({ predicate })`, meant to be wired into `<ErrorBoundary>`'s `beforeReset` so a retry actually refetches instead of instantly re-throwing the stale cached error. `@tanstack/vue-query` is an optional peer dependency. Verified with a real `useQuery`/`throwOnError` component mounted under a real `<ErrorBoundary>` — the retried query's `queryFn` is confirmed to actually re-run
- `adapters/otel` — `createOtelReporter({ tracer, spanName?, attributes? })`: starts a span per error, calls `recordException()` + `setStatus({ code: ERROR })`, attaches the `CapturedError` fields as span attributes. Structurally typed like the Sentry/Bugsnag/LogRocket adapters — `@opentelemetry/api` is never imported by this package (verified: a minimal real usage of it bundles to ~2.8 kB gzip on its own, so importing it directly would cost every consumer of this adapter, unlike Sentry/Bugsnag/LogRocket where the SDK is assumed already-initialized for other reasons)
- `<AsyncBoundary>` (`vue-error-boundary-kit/async-boundary`) — `<Suspense>` and `<ErrorBoundary>` combined into one component (`default`/`loading`/`fallback` slots), for the async-setup/async-component case that today needs manual nesting. A composition over the existing `<ErrorBoundary>` (same props/events/exposed API), not a reimplementation — kept as its own entry point rather than added to the core bundle, so it costs nothing unless imported
- `adapters/breadcrumbs` — `createBreadcrumbTrail({ limit? })` (a rolling, manually-recorded event trail — nothing auto-instrumented) + `withBreadcrumbs(reporter, { trail, contextKey? })`, a reporter wrapper that merges the trail's current entries into every `report()` call's context. `trail.record` is itself an `ErrorReporter`, so captured errors can feed the same trail. Its own isolated entry point — core bundle untouched
- `vue-error-boundary-kit/testing` — `ThrowInRender`/`ThrowInSetup`/`ThrowInAsyncSetup`/`ThrowAbortError` (throw-on-demand test components), `makeCapturedError()` (a `CapturedError` fixture builder), and `createRecordingReporter()` (a framework-agnostic `ErrorReporter` test double — no `vi.fn()`/`jest.fn()` dependency baked in). Generalizes test-double patterns this package already used internally
- `vue-error-boundary-kit/retry-backoff` — `createBackoffRetry(boundaryRef, options?)`: wraps a `<ErrorBoundary>`/`<AsyncBoundary>` template ref's `retry()` with an increasing delay (`baseDelayMs * factor ** retryCount`, capped at `maxDelayMs`) for transient failures where an instant retry just fails again the same way. Kept out of `<ErrorBoundary>`'s own props deliberately — not every use case needs retry to be delayed, and this composes with the existing exposed `{ retry, retryCount }` API instead of growing it
- `vue-error-boundary-kit/router` — `useRouterErrorBoundary()`, the `vue-router`-only equivalent of `useNuxtErrorBoundary()`: wires `router.onError()` into `useErrorBoundary()`, catching errors thrown in navigation guards, passed to `next()`, or raised resolving an async route component — none of which reach `onErrorCaptured`. `vue-router` is an optional peer dependency. Verified against a real `router.onError()` (`vue-router@5.2.0`) with both a throwing guard and a rejected async route component
- CI (GitHub Actions): lint/format/typecheck/test+coverage/build on every push/PR (Node 20.x & 22.x), plus a tag-triggered publish workflow
- `CONTRIBUTING.md`, issue templates (bug report / feature request), PR template
- npm version / CI status / license badges in README
- `demo:typecheck` / `demo:build` / `lint:ci` / `format:check` scripts — `demo/` previously had no working typecheck (plain `tsc` silently skips `.vue` files without `vue-tsc`)

### Fixed

- CI failed on Node 18.x with `SyntaxError: The requested module 'node:util' does not provide an export named 'styleText'`, thrown from inside `rolldown` (Vite 8's bundler) before any of this package's own code ran. Confirmed by reproducing on real Node 18.12.0 and 20.10.0 (both fail identically) and Node 22.23.2 (works) via local `nvm` — `styleText` isn't exported by `node:util` at all before Node 20.12/22, and Vite 8/`rolldown` themselves declare `engines.node: "^20.19.0 || >=22.12.0"`. `engines.node` bumped to match exactly, and the CI matrix's `18.x` entry replaced with `20.x`/`22.x`. This is a *build-tooling* requirement only — the published `dist/` output doesn't use anything Node-20-specific, so it doesn't affect consumers running this package on an older Node; see [CONTRIBUTING.md](CONTRIBUTING.md#setup)

### Changed

- Core bundle grew from ~1.8 kB to ~2.1 kB gzip — `useErrorBoundary` and `ErrorBoundary.vue` are now shared chunks between the core entry and, respectively, `/nuxt/runtime` and `/async-boundary`, so Rollup splits each into its own small chunk instead of inlining them once. Still comfortably inside the documented 3 kB budget
- README: documented, with empirical evidence, that `<Suspense>` cannot be used to get real fallback markup into server-rendered HTML (see [SSR notes](README.md#ssr-notes)) — the existing limitation stands, now verified rather than assumed
- README: documented why a real Vue Devtools browser-extension integration was considered and declined (`@vue/devtools-api` alone costs ~20 kB gzip, over 9× this package's core budget) — see [Debugging: error history](README.md#debugging-error-history)
- README: documented why a custom Nuxt DevTools tab (`@nuxt/devtools-kit`'s `addCustomTab()`) was also considered and declined — a live tab needs an `iframe` view backed by its own client↔devtools-server RPC bridge, since `createErrorHistory()`'s reactive state lives in the browser app while the module's `setup()` runs in Node; the ecosystem is also mid-major-transition (`latest` on npm is a `4.0.0-alpha`) — see the same section
- Bumped the dev/build toolchain to latest majors: Vite 8, Vitest 4, `@vitest/coverage-v8` 4, `vite-plugin-dts` 5, `@vitejs/plugin-vue` 6, `vue-tsc` 3, `happy-dom` 20, ESLint 10.8, `typescript-eslint` 8.67, Prettier 3.9. TypeScript stays on 6.0.x rather than jumping to 7.x — `vue-tsc` (even at latest) fails outright against TypeScript 7's restructured package exports; 6.0.x is the newest release both `vue-tsc` and `typescript-eslint` actually support. No runtime or public API changes.
- `vite.config.ts`: `minify: 'esbuild'` → `minify: true` — Vite 8's default bundler (`rolldown`) no longer pulls in the `esbuild` package, so the explicit option made `npm run build` fail; the default minifier needs no such package
- Added `demo/.npmrc` (`workspaces-update=false`) — npm's default nested-project auto-linking was silently adding a `vue-error-boundary-kit: file:..` dependency into `demo/package.json` on every `npm install` inside `demo/`, redundant with (and confusing next to) the existing Vite-alias/tsconfig-paths resolution to `../src`

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

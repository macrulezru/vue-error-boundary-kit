# Contributing

Thanks for considering a contribution to `vue-error-boundary-kit`.

## Setup

Requires Node `^20.19.0 || >=22.12.0` — Vite 8's bundler (`rolldown`) imports `node:util`'s `styleText`, which doesn't exist at all on Node 18 and isn't present before Node 20.12/22 either; anything under those floors fails immediately with a `SyntaxError` from inside `rolldown`, not from this package's own code. This is a *build-tooling* requirement, not a runtime one — the published `dist/` output is plain ES2020 with zero dependencies beyond the `vue` peer, so consuming this package in an app on an older Node (e.g. an SSR server) is unaffected; `engines.node` reflects what's needed to build/test from source, which is also what CI enforces.

```bash
npm install
npm test
```

The demo app has its own `package.json` and is not part of the root install:

```bash
npm run demo
```

## Scripts

| Command | What it does |
|---|---|
| `npm test` | Run the test suite once |
| `npm run test:watch` | Run tests in watch mode |
| `npm run test:coverage` | Run tests with coverage (thresholds enforced in `vitest.config.ts`) |
| `npm run typecheck` | `vue-tsc --noEmit` on `src/` |
| `npm run lint` | ESLint, auto-fixing |
| `npm run format` | Prettier, writing changes |
| `npm run build` | Production build (`dist/`) |
| `npm run demo` | Run the demo app's dev server |
| `npm run demo:typecheck` | Typecheck the demo app against the local source (not a published version) |
| `npm run demo:build` | Production build of the demo app |

CI runs `lint:ci` / `format:check` (check-only, no writes) plus typecheck, test with coverage, build, and the demo typecheck/build — see [.github/workflows/ci.yml](.github/workflows/ci.yml). Run the writing variants (`lint`, `format`) locally before pushing.

## Before opening a PR

- Add or update tests for any behavior change — this package aims to keep coverage at the levels enforced in `vitest.config.ts`.
- Run `npm run lint`, `npm run format`, `npm run typecheck`, and `npm test` locally; all must pass.
- If you touch `<ErrorBoundary>`, `useErrorBoundary`, `useGlobalErrorCapture`, or an adapter's public options, update the relevant section of [README.md](README.md).
- Add an entry under `[Unreleased]` in [CHANGELOG.md](CHANGELOG.md) (Keep a Changelog format).
- Keep PRs focused — one behavior change per PR is easier to review than a bundle of unrelated ones.

## Design constraints worth knowing before you start

- **Zero runtime dependencies beyond `vue` (peer).** Adapters (Sentry, Bugsnag, LogRocket, HTTP) are structurally typed against the third-party client shape — they never import the third-party SDK itself. Keep new adapters the same way.
- **No internal Vue renderer APIs.** `<ErrorBoundary>` is built only from public APIs (`onErrorCaptured`, `provide`/`inject`, templates). This is also why the SSR fallback can't swap in on the server — see the README's SSR notes before trying to "fix" that without an internal API.
- Each adapter and optional entry point (`/global-capture`, `/devtools`, `/adapters/*`) is its own build entry so importing the core `<ErrorBoundary>` never pulls in code you didn't ask for. If you add a new entry point, wire it into `vite.config.ts`'s multi-entry list and the `exports` map in `package.json`.

## Reporting bugs / requesting features

Use the issue templates — they ask for the minimum needed to reproduce or evaluate a request.

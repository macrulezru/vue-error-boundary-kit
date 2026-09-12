import { describe, expect, it, vi } from 'vitest'
import type { Nuxt } from '@nuxt/schema'

const addComponent = vi.fn()
const addImports = vi.fn()

vi.mock('@nuxt/kit', async () => {
  const actual = await vi.importActual<typeof import('@nuxt/kit')>('@nuxt/kit')
  return {
    ...actual,
    defineNuxtModule: (config: unknown) => config,
    addComponent,
    addImports,
    useLogger: () => ({ debug: vi.fn(), warn: vi.fn(), error: vi.fn() }),
  }
})

const mod = (await import('../module')).default as unknown as {
  meta: { name: string; configKey: string }
  setup: (options: { component: boolean; autoImports: boolean }, nuxt: Nuxt) => void
}

function makeNuxt() {
  const hooks: Record<string, ((payload: never) => void)[]> = {}
  const nuxt = {
    hook: vi.fn((name: string, fn: (payload: never) => void) => {
      ;(hooks[name] ??= []).push(fn)
    }),
  }
  return { nuxt: nuxt as unknown as Nuxt, hooks }
}

describe('vue-error-boundary-kit/nuxt module', () => {
  it('exposes the expected module meta', () => {
    expect(mod.meta).toMatchObject({
      name: 'vue-error-boundary-kit',
      configKey: 'errorBoundaryKit',
    })
  })

  it('registers <ErrorBoundary> and <AsyncBoundary> as global components by default', () => {
    addComponent.mockClear()
    const { nuxt } = makeNuxt()
    mod.setup({ component: true, autoImports: true }, nuxt)
    expect(addComponent).toHaveBeenCalledWith({
      name: 'ErrorBoundary',
      filePath: 'vue-error-boundary-kit',
      export: 'ErrorBoundary',
    })
    // Regression: only <ErrorBoundary> used to be registered — <AsyncBoundary>
    // needed a manual import even under Nuxt.
    expect(addComponent).toHaveBeenCalledWith({
      name: 'AsyncBoundary',
      filePath: 'vue-error-boundary-kit/async-boundary',
      export: 'AsyncBoundary',
    })
    expect(addComponent).toHaveBeenCalledTimes(2)
  })

  it('skips component registration when component: false', () => {
    addComponent.mockClear()
    const { nuxt } = makeNuxt()
    mod.setup({ component: false, autoImports: true }, nuxt)
    expect(addComponent).not.toHaveBeenCalled()
  })

  it('auto-imports every public composable/factory, not just 3', () => {
    // Regression: only useErrorBoundary/useGlobalErrorCapture/useNuxtErrorBoundary
    // were auto-imported — every other composable/factory (router, tanstack-query,
    // retry/backoff, error history, every reporter adapter) needed a manual
    // import even under Nuxt.
    addImports.mockClear()
    const { nuxt } = makeNuxt()
    mod.setup({ component: true, autoImports: true }, nuxt)
    const imported = addImports.mock.calls[0][0] as Array<{ name: string; from: string }>
    const names = imported.map((i) => i.name)

    expect(names).toEqual(
      expect.arrayContaining([
        'useErrorBoundary',
        'useGlobalErrorCapture',
        'useNuxtErrorBoundary',
        'useRouterErrorBoundary',
        'useQueryErrorReset',
        'createBackoffRetry',
        'createErrorHistory',
        'createConsoleReporter',
        'consoleReporter',
        'createHttpReporter',
        'createSentryReporter',
        'createBugsnagReporter',
        'createLogRocketReporter',
        'createRateLimitedReporter',
        'createOtelReporter',
        'createBreadcrumbTrail',
        'withBreadcrumbs',
      ]),
    )
  })

  it('skips auto-imports when autoImports: false', () => {
    addImports.mockClear()
    const { nuxt } = makeNuxt()
    mod.setup({ component: true, autoImports: false }, nuxt)
    expect(addImports).not.toHaveBeenCalled()
  })

  it('registers a prepare:types hook referencing the /nuxt subpath', () => {
    const { nuxt, hooks } = makeNuxt()
    mod.setup({ component: true, autoImports: true }, nuxt)

    const payload = { references: [] as { types: string }[] }
    for (const fn of hooks['prepare:types'] ?? []) fn(payload as never)

    expect(payload.references).toContainEqual({ types: 'vue-error-boundary-kit/nuxt' })
  })
})

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

  it('registers <ErrorBoundary> as a global component by default', () => {
    addComponent.mockClear()
    const { nuxt } = makeNuxt()
    mod.setup({ component: true, autoImports: true }, nuxt)
    expect(addComponent).toHaveBeenCalledWith({
      name: 'ErrorBoundary',
      filePath: 'vue-error-boundary-kit',
      export: 'ErrorBoundary',
    })
  })

  it('skips component registration when component: false', () => {
    addComponent.mockClear()
    const { nuxt } = makeNuxt()
    mod.setup({ component: false, autoImports: true }, nuxt)
    expect(addComponent).not.toHaveBeenCalled()
  })

  it('auto-imports useErrorBoundary/useGlobalErrorCapture/useNuxtErrorBoundary by default', () => {
    addImports.mockClear()
    const { nuxt } = makeNuxt()
    mod.setup({ component: true, autoImports: true }, nuxt)
    expect(addImports).toHaveBeenCalledWith([
      { name: 'useErrorBoundary', from: 'vue-error-boundary-kit' },
      { name: 'useGlobalErrorCapture', from: 'vue-error-boundary-kit/global-capture' },
      { name: 'useNuxtErrorBoundary', from: 'vue-error-boundary-kit/nuxt/runtime' },
    ])
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

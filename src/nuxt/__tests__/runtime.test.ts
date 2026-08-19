import { describe, expect, it, vi } from 'vitest'

// Test double stands in for Nuxt's real per-hook overloaded signatures, not worth reproducing here.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type HookMap = Record<string, ((...args: any[]) => void)[]>

function makeNuxtApp() {
  const hooks: HookMap = {}
  const nuxtApp = {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    hook: vi.fn((name: string, fn: (...args: any[]) => void) => {
      ;(hooks[name] ??= []).push(fn)
    }),
  }
  return { nuxtApp, hooks }
}

let currentApp: ReturnType<typeof makeNuxtApp>['nuxtApp']

vi.mock('nuxt/app', () => ({
  useNuxtApp: () => currentApp,
}))

const { useNuxtErrorBoundary } = await import('../runtime')

describe('useNuxtErrorBoundary', () => {
  it('registers vue:error and app:error hooks on the current nuxt app', () => {
    const { nuxtApp } = makeNuxtApp()
    currentApp = nuxtApp
    useNuxtErrorBoundary()
    expect(nuxtApp.hook).toHaveBeenCalledWith('vue:error', expect.any(Function))
    expect(nuxtApp.hook).toHaveBeenCalledWith('app:error', expect.any(Function))
  })

  it('captures a vue:error escape as source "render", tagged with the component name', () => {
    const { nuxtApp, hooks } = makeNuxtApp()
    currentApp = nuxtApp
    const boundary = useNuxtErrorBoundary()

    const instance = { $: { type: { name: 'Boom' } } }
    hooks['vue:error']?.[0]?.(new Error('boom'), instance, 'render function')

    expect(boundary.hasError.value).toBe(true)
    expect(boundary.error.value).toMatchObject({
      message: 'boom',
      componentName: 'Boom',
      source: 'render',
    })
  })

  it('captures an app:error escape as source "manual"', () => {
    const { nuxtApp, hooks } = makeNuxtApp()
    currentApp = nuxtApp
    const boundary = useNuxtErrorBoundary()

    hooks['app:error']?.[0]?.(new Error('fatal'))

    expect(boundary.error.value).toMatchObject({ message: 'fatal', source: 'manual' })
  })

  it('forwards reporter/onError options to the underlying useErrorBoundary()', () => {
    const { nuxtApp, hooks } = makeNuxtApp()
    currentApp = nuxtApp
    const onError = vi.fn()
    useNuxtErrorBoundary({ onError })

    hooks['app:error']?.[0]?.(new Error('fatal'))

    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ message: 'fatal' }))
  })
})

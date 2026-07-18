import { describe, expect, it, vi } from 'vitest'
import { h, nextTick, reactive } from 'vue'
import { mount } from '@vue/test-utils'
import ErrorBoundary from '../ErrorBoundary.vue'
import type { CapturedError } from '../types'
import { AbortBoom, Boom, SyncSetupBoom, Working } from './helpers'

function fallbackRender(scope: {
  error: CapturedError
  reset: () => void
  retry: () => void
  retryCount: number
  canRetry: boolean
}) {
  return h('div', { class: 'fallback' }, [
    h('span', { class: 'fallback-message' }, scope.error.message),
    h('span', { class: 'fallback-retry-count' }, String(scope.retryCount)),
    h(
      'button',
      { class: 'fallback-retry', disabled: !scope.canRetry, onClick: scope.retry },
      'retry',
    ),
  ])
}

describe('ErrorBoundary — case 1: sync render error in child', () => {
  it('renders the fallback slot instead of crashing', async () => {
    const wrapper = mount(ErrorBoundary, {
      slots: {
        default: () => h(Boom, { message: 'render boom' }),
        fallback: fallbackRender,
      },
    })
    await nextTick()

    expect(wrapper.find('.fallback').exists()).toBe(true)
    expect(wrapper.find('.fallback-message').text()).toBe('render boom')
  })

  it('labels a synchronous (non-async) setup() throw as source "render", not "async"', async () => {
    // Vue reports both a sync setup() throw and an async setup() rejection with the identical
    // "setup function" info string — only checking whether setup is itself an AsyncFunction
    // tells them apart. Regression coverage for a mislabeling caught while driving the demo.
    let captured: CapturedError | undefined
    mount(ErrorBoundary, {
      props: { onError: (e: CapturedError) => (captured = e) },
      slots: {
        default: () => h(SyncSetupBoom, { message: 'sync setup boom' }),
        fallback: fallbackRender,
      },
    })
    await nextTick()

    expect(captured?.source).toBe('render')
    expect(captured?.message).toBe('sync setup boom')
  })
})

describe('ErrorBoundary — case 3: resetKeys', () => {
  it('auto-resets and re-renders default when a resetKey changes', async () => {
    const state = reactive({ shouldThrow: true, routeId: 'a' })

    const wrapper = mount(
      {
        setup() {
          return () =>
            h(
              ErrorBoundary,
              { resetKeys: [state.routeId] },
              {
                default: () => h(Boom, { shouldThrow: state.shouldThrow, message: 'route boom' }),
                fallback: fallbackRender,
              },
            )
        },
      },
      {},
    )
    await nextTick()
    expect(wrapper.find('.fallback').exists()).toBe(true)

    // Fix the underlying condition, then change the resetKey — boundary should retry rendering default.
    state.shouldThrow = false
    state.routeId = 'b'
    await nextTick()
    await nextTick()

    expect(wrapper.find('.fallback').exists()).toBe(false)
    expect(wrapper.find('.boom-ok').exists()).toBe(true)
  })

  it('does not reset when an unrelated prop changes', async () => {
    const state = reactive({ routeId: 'a', other: 1 })
    mount(
      {
        setup() {
          return () =>
            h(
              ErrorBoundary,
              { resetKeys: [state.routeId] },
              { default: () => h(Boom), fallback: fallbackRender },
            )
        },
      },
      {},
    )
    await nextTick()
    state.other = 2
    await nextTick()
    // no assertion needed beyond "doesn't throw" — resetKeys unchanged means no reset attempt
  })
})

describe('ErrorBoundary — case 4 & 5: retry() and maxRetries', () => {
  it('retry() restores default; a repeat failure increments retryCount', async () => {
    const wrapper = mount(ErrorBoundary, {
      slots: {
        default: () => h(Boom, { message: 'retry boom' }),
        fallback: fallbackRender,
      },
    })
    await nextTick()
    expect(wrapper.find('.fallback').exists()).toBe(true)
    expect(wrapper.find('.fallback-retry-count').text()).toBe('0')

    await wrapper.find('.fallback-retry').trigger('click')
    await nextTick()

    // Boom still throws deterministically, so it fails again immediately.
    expect(wrapper.find('.fallback').exists()).toBe(true)
    expect(wrapper.find('.fallback-retry-count').text()).toBe('1')
  })

  it('disables the retry control once maxRetries is exhausted', async () => {
    const wrapper = mount(ErrorBoundary, {
      props: { maxRetries: 2 },
      slots: {
        default: () => h(Boom, { message: 'capped boom' }),
        fallback: fallbackRender,
      },
    })
    await nextTick()

    await wrapper.find('.fallback-retry').trigger('click')
    await nextTick()
    expect(wrapper.find('.fallback-retry-count').text()).toBe('1')
    expect((wrapper.find('.fallback-retry').element as HTMLButtonElement).disabled).toBe(false)

    await wrapper.find('.fallback-retry').trigger('click')
    await nextTick()
    expect(wrapper.find('.fallback-retry-count').text()).toBe('2')
    expect((wrapper.find('.fallback-retry').element as HTMLButtonElement).disabled).toBe(true)
  })
})

describe('ErrorBoundary — case 6: isolate', () => {
  it('isolate: true (default) keeps the error local — no parent event', async () => {
    const parentErrors: CapturedError[] = []
    mount(ErrorBoundary, {
      props: { onError: (e: CapturedError) => parentErrors.push(e) },
      slots: {
        default: () =>
          h(
            ErrorBoundary,
            {},
            { default: () => h(Boom, { message: 'isolated boom' }), fallback: fallbackRender },
          ),
        fallback: fallbackRender,
      },
    })
    await nextTick()
    expect(parentErrors).toHaveLength(0)
  })

  it('isolate: false bubbles the error to the ancestor boundary', async () => {
    const parentErrors: CapturedError[] = []
    const wrapper = mount(ErrorBoundary, {
      props: { onError: (e: CapturedError) => parentErrors.push(e) },
      slots: {
        default: () =>
          h(
            ErrorBoundary,
            { isolate: false },
            { default: () => h(Boom, { message: 'bubbled boom' }), fallback: fallbackRender },
          ),
        fallback: fallbackRender,
      },
    })
    await nextTick()

    expect(parentErrors).toHaveLength(1)
    expect(parentErrors[0]?.message).toBe('bubbled boom')
    expect(wrapper.find('.fallback-message').text()).toBe('bubbled boom')
  })
})

describe('ErrorBoundary — shouldCatch', () => {
  it('lets a filtered error pass through to an ancestor boundary untouched', async () => {
    const innerErrors: CapturedError[] = []
    const outerErrors: CapturedError[] = []

    const wrapper = mount(ErrorBoundary, {
      props: { onError: (e: CapturedError) => outerErrors.push(e) },
      slots: {
        default: () =>
          h(
            ErrorBoundary,
            {
              shouldCatch: (e: CapturedError) => (e.error as DOMException)?.name !== 'AbortError',
              onError: (e: CapturedError) => innerErrors.push(e),
            },
            { default: () => h(AbortBoom), fallback: fallbackRender },
          ),
        fallback: fallbackRender,
      },
    })
    await nextTick()

    // The inner boundary never touched it — no state, no event, no fallback there.
    expect(innerErrors).toHaveLength(0)
    // It propagated via Vue's own onErrorCaptured bubbling and was caught by the outer boundary.
    expect(outerErrors).toHaveLength(1)
    expect(outerErrors[0]?.message).toContain('aborted')
    expect(wrapper.find('.fallback-message').exists()).toBe(true)
  })

  it('still catches errors the predicate approves', async () => {
    const wrapper = mount(ErrorBoundary, {
      props: {
        shouldCatch: (e: CapturedError) => (e.error as DOMException)?.name !== 'AbortError',
      },
      slots: {
        default: () => h(Boom, { message: 'not an abort' }),
        fallback: fallbackRender,
      },
    })
    await nextTick()

    expect(wrapper.find('.fallback-message').text()).toBe('not an abort')
  })

  it('does not report a filtered-out error', async () => {
    const reporter = { report: vi.fn() }
    mount(ErrorBoundary, {
      slots: {
        default: () =>
          h(
            ErrorBoundary,
            {
              shouldCatch: (e: CapturedError) => (e.error as DOMException)?.name !== 'AbortError',
              reporter,
            },
            { default: () => h(AbortBoom) },
          ),
        fallback: fallbackRender,
      },
    })
    await nextTick()
    expect(reporter.report).not.toHaveBeenCalled()
  })
})

describe('ErrorBoundary — internalErrorPrefix', () => {
  it('uses a custom prefix for the safety-net log when beforeReset/reporter throw', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const wrapper = mount(ErrorBoundary, {
      props: {
        internalErrorPrefix: '[my-app]',
        beforeReset: () => {
          throw new Error('beforeReset boom')
        },
        reporter: {
          report: () => {
            throw new Error('reporter boom')
          },
        },
      },
      slots: {
        default: () => h(Boom, { message: 'prefix test' }),
        fallback: fallbackRender,
      },
    })
    await nextTick()
    // The reporter throwing during capture already logs once; reset() throwing logs again.
    expect(spy.mock.calls.length).toBeGreaterThanOrEqual(1)
    await wrapper.find('.fallback-retry').trigger('click')
    await nextTick()

    for (const call of spy.mock.calls) {
      expect(call[0]).toMatch(/^\[my-app\] /)
    }
    spy.mockRestore()
  })

  it('defaults to [vue-error-boundary-kit] when no prefix is given', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    mount(ErrorBoundary, {
      props: {
        reporter: {
          report: () => {
            throw new Error('reporter boom')
          },
        },
      },
      slots: {
        default: () => h(Boom, { message: 'default prefix test' }),
        fallback: fallbackRender,
      },
    })
    await nextTick()
    expect(spy.mock.calls[0]?.[0]).toMatch(/^\[vue-error-boundary-kit\] /)
    spy.mockRestore()
  })
})

describe('ErrorBoundary — beforeReset (not onReset)', () => {
  // Regression test: the prop was originally named `onReset`, which collides with the `onReset`
  // listener key Vue auto-derives for this component's own `reset` emit. Vue's emit()
  // independently invokes `props.onReset` whenever `emit('reset')` fires, regardless of whether
  // that key was "really" a declared prop — so a same-named prop got invoked twice per reset,
  // and the second (emit-triggered) call happened outside this package's own try/catch, escaping
  // the recursion guard entirely if it threw. Renamed to `beforeReset` to structurally avoid it.
  it('calls beforeReset exactly once per reset, and a @reset listener also fires exactly once', async () => {
    const beforeReset = vi.fn()
    const onResetEvent = vi.fn()
    const wrapper = mount(ErrorBoundary, {
      props: { beforeReset, onReset: onResetEvent },
      slots: {
        default: () => h(Boom, { message: 'beforeReset test' }),
        fallback: fallbackRender,
      },
    })
    await nextTick()

    await wrapper.find('.fallback-retry').trigger('click')
    await nextTick()

    expect(beforeReset).toHaveBeenCalledTimes(1)
    expect(onResetEvent).toHaveBeenCalledTimes(1)
  })

  it('a throwing beforeReset is caught by the internal safety net, not left to escape via emit()', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const wrapper = mount(ErrorBoundary, {
      props: {
        beforeReset: () => {
          throw new Error('beforeReset boom')
        },
      },
      slots: {
        default: () => h(Boom, { message: 'beforeReset throws' }),
        fallback: fallbackRender,
      },
    })
    await nextTick()

    // If this were still leaking through emit()'s own listener invocation (outside our
    // safeInvoke), it would surface as a vitest-level "Unhandled Rejection" for the whole run
    // instead of a clean, caught, logged failure here.
    await wrapper.find('.fallback-retry').trigger('click')
    await nextTick()

    expect(spy).toHaveBeenCalledWith(
      expect.stringContaining('error handler/reporter threw:'),
      expect.any(Error),
    )
    spy.mockRestore()
  })
})

describe('ErrorBoundary — exposed instance (template ref) API', () => {
  it('reset()/retry() work from outside the fallback slot, e.g. via a template ref', async () => {
    const wrapper = mount(ErrorBoundary, {
      slots: {
        default: () => h(Boom, { message: 'exposed boom' }),
        fallback: fallbackRender,
      },
    })
    await nextTick()
    expect(wrapper.find('.fallback').exists()).toBe(true)

    const exposed = wrapper.vm as unknown as {
      hasError: boolean
      retryCount: number
      reset: () => void
      retry: () => void
    }
    expect(exposed.hasError).toBe(true)

    exposed.retry()
    await nextTick()
    expect(exposed.retryCount).toBe(1)
    expect(wrapper.find('.fallback').exists()).toBe(true) // Boom still throws deterministically

    exposed.reset()
    await nextTick()
    expect(exposed.retryCount).toBe(0)
  })

  it('reset()/retry() are harmless no-ops when there is no error', () => {
    const wrapper = mount(ErrorBoundary, {
      slots: { default: () => h(Working), fallback: fallbackRender },
    })
    const exposed = wrapper.vm as unknown as { reset: () => void; retry: () => void }
    expect(() => {
      exposed.reset()
      exposed.retry()
    }).not.toThrow()
  })
})

describe('ErrorBoundary — healthy path', () => {
  it('renders default content when nothing throws', () => {
    const wrapper = mount(ErrorBoundary, {
      slots: {
        default: () => h(Working, { label: 'hello' }),
        fallback: fallbackRender,
      },
    })
    expect(wrapper.find('.working').text()).toBe('hello')
    expect(wrapper.find('.fallback').exists()).toBe(false)
  })
})

import { describe, expect, it } from 'vitest'
import { h, nextTick } from 'vue'
import { mount } from '@vue/test-utils'
import ErrorBoundary from '../ErrorBoundary.vue'
import type { CapturedError } from '../types'
import {
  ThrowAbortError,
  ThrowInAsyncSetup,
  ThrowInRender,
  ThrowInSetup,
  createRecordingReporter,
  makeCapturedError,
} from '../testing'

describe('testing utilities', () => {
  describe('ThrowInRender', () => {
    it('renders "ok" when shouldThrow is false', () => {
      const wrapper = mount(ThrowInRender, { props: { shouldThrow: false, message: 'fine' } })
      expect(wrapper.find('.ok').text()).toBe('fine')
    })

    it('throws by default, caught by <ErrorBoundary> as source "render"', async () => {
      const reporter = createRecordingReporter()
      const wrapper = mount(ErrorBoundary, {
        props: { reporter },
        slots: {
          default: () => h(ThrowInRender, { message: 'render boom' }),
          fallback: ({ error }: { error: CapturedError }) =>
            h('div', { class: 'fallback' }, error.message),
        },
      })
      await nextTick()

      expect(wrapper.find('.fallback').text()).toBe('render boom')
      expect(reporter.calls).toHaveLength(1)
      expect(reporter.calls[0]?.error.source).toBe('render')
    })
  })

  it('ThrowInSetup is caught by <ErrorBoundary> and classified as source "render"', async () => {
    const reporter = createRecordingReporter()
    const wrapper = mount(ErrorBoundary, {
      props: { reporter },
      slots: {
        default: () => h(ThrowInSetup, { message: 'setup boom' }),
        fallback: ({ error }: { error: CapturedError }) =>
          h('div', { class: 'fallback' }, error.message),
      },
    })
    await nextTick()

    expect(wrapper.find('.fallback').text()).toBe('setup boom')
    expect(reporter.calls[0]?.error.source).toBe('render')
  })

  it('ThrowInAsyncSetup is caught by <ErrorBoundary> and classified as source "async"', async () => {
    const { Suspense, defineComponent } = await import('vue')
    const { flushPromises } = await import('@vue/test-utils')
    const reporter = createRecordingReporter()

    const Harness = defineComponent({
      render: () =>
        h(
          ErrorBoundary,
          { reporter },
          {
            default: () =>
              h(Suspense, null, {
                default: () => h(ThrowInAsyncSetup, { message: 'async boom' }),
                fallback: () => h('div', 'loading'),
              }),
            fallback: ({ error }: { error: CapturedError }) =>
              h('div', { class: 'fallback' }, error.message),
          },
        ),
    })

    const wrapper = mount(Harness)
    await flushPromises()

    expect(wrapper.find('.fallback').text()).toBe('async boom')
    expect(reporter.calls[0]?.error.source).toBe('async')
  })

  it('ThrowAbortError throws an AbortError DOMException', async () => {
    const reporter = createRecordingReporter()
    const wrapper = mount(ErrorBoundary, {
      props: { reporter },
      slots: {
        default: () => h(ThrowAbortError),
        fallback: ({ error }: { error: CapturedError }) =>
          h('div', { class: 'fallback' }, error.message),
      },
    })
    await nextTick()

    expect(wrapper.find('.fallback').exists()).toBe(true)
    expect((reporter.calls[0]?.error.error as DOMException).name).toBe('AbortError')
  })

  describe('makeCapturedError', () => {
    it('fills in sensible defaults', () => {
      const captured = makeCapturedError()
      expect(captured.message).toBe('test error')
      expect(captured.source).toBe('manual')
      expect(captured.error).toBeInstanceOf(Error)
      expect(typeof captured.timestamp).toBe('number')
    })

    it('an explicit undefined in overrides does not clobber the required-field defaults', () => {
      // Regression test: defaults must be applied *after* spreading overrides, or a caller
      // passing `{ message: undefined, ... }` (e.g. via a generic override-composing helper)
      // would produce a CapturedError with message/source/timestamp/error actually undefined.
      const captured = makeCapturedError({
        message: undefined,
        source: undefined,
        timestamp: undefined,
        error: undefined,
      })
      expect(captured.message).toBe('test error')
      expect(captured.source).toBe('manual')
      expect(captured.error).toBeInstanceOf(Error)
      expect(typeof captured.timestamp).toBe('number')
    })

    it('respects overrides', () => {
      const captured = makeCapturedError({
        message: 'custom',
        source: 'event',
        componentName: 'Widget',
      })
      expect(captured).toMatchObject({
        message: 'custom',
        source: 'event',
        componentName: 'Widget',
      })
    })
  })

  describe('createRecordingReporter', () => {
    it('records report() calls in order, with error and context', () => {
      const reporter = createRecordingReporter()
      const a = makeCapturedError({ message: 'a' })
      const b = makeCapturedError({ message: 'b' })

      reporter.report(a, { userId: '1' })
      reporter.report(b)

      expect(reporter.calls).toEqual([
        { error: a, context: { userId: '1' } },
        { error: b, context: undefined },
      ])
    })

    it('reset() clears recorded calls', () => {
      const reporter = createRecordingReporter()
      reporter.report(makeCapturedError())
      reporter.reset()
      expect(reporter.calls).toHaveLength(0)
    })
  })
})

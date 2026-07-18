import { describe, expect, it, vi } from 'vitest'
import { effectScope } from 'vue'
import { useGlobalErrorCapture } from '../useGlobalErrorCapture'
import type { CapturedError } from '../types'

function dispatchWindowError(error: Error): void {
  const event = new Event('error') as Event & { error?: unknown; message?: string }
  event.error = error
  event.message = error.message
  window.dispatchEvent(event)
}

function dispatchUnhandledRejection(reason: unknown): void {
  const event = new Event('unhandledrejection') as Event & { reason?: unknown }
  event.reason = reason
  window.dispatchEvent(event)
}

describe('useGlobalErrorCapture', () => {
  it('captures window error events with source "event"', () => {
    const onError = vi.fn()
    const { stop } = useGlobalErrorCapture({ onError })

    dispatchWindowError(new Error('global boom'))

    expect(onError).toHaveBeenCalledTimes(1)
    const captured = onError.mock.calls[0]?.[0] as CapturedError
    expect(captured.message).toBe('global boom')
    expect(captured.source).toBe('event')

    stop()
  })

  it('captures unhandled promise rejections with source "unhandledrejection"', () => {
    const onError = vi.fn()
    const { stop } = useGlobalErrorCapture({ onError })

    dispatchUnhandledRejection(new Error('rejected'))

    expect(onError).toHaveBeenCalledTimes(1)
    const captured = onError.mock.calls[0]?.[0] as CapturedError
    expect(captured.message).toBe('rejected')
    expect(captured.source).toBe('unhandledrejection')

    stop()
  })

  it('dispatches to the configured reporter', () => {
    const reporter = { report: vi.fn() }
    const { stop } = useGlobalErrorCapture({ reporter })

    dispatchWindowError(new Error('reported boom'))

    expect(reporter.report).toHaveBeenCalledTimes(1)
    stop()
  })

  it('stop() removes both listeners', () => {
    const onError = vi.fn()
    const { stop } = useGlobalErrorCapture({ onError })
    stop()

    dispatchWindowError(new Error('after stop'))
    dispatchUnhandledRejection(new Error('after stop 2'))

    expect(onError).not.toHaveBeenCalled()
  })

  it('respects captureErrors: false / captureRejections: false', () => {
    const onError = vi.fn()
    const { stop } = useGlobalErrorCapture({ onError, captureErrors: false })

    dispatchWindowError(new Error('should be ignored'))
    expect(onError).not.toHaveBeenCalled()

    dispatchUnhandledRejection(new Error('should be captured'))
    expect(onError).toHaveBeenCalledTimes(1)

    stop()
  })

  it('cleans up automatically when the enclosing effect scope is disposed', () => {
    const onError = vi.fn()
    const scope = effectScope()
    scope.run(() => {
      useGlobalErrorCapture({ onError })
    })

    scope.stop()
    dispatchWindowError(new Error('after scope stop'))

    expect(onError).not.toHaveBeenCalled()
  })

  it('shouldCatch: ignores an error the predicate rejects, still catches others', () => {
    const onError = vi.fn()
    const { stop } = useGlobalErrorCapture({
      onError,
      shouldCatch: (e) => (e.error as DOMException)?.name !== 'AbortError',
    })

    dispatchWindowError(new DOMException('aborted', 'AbortError'))
    expect(onError).not.toHaveBeenCalled()

    dispatchWindowError(new Error('a real bug'))
    expect(onError).toHaveBeenCalledTimes(1)

    stop()
  })

  it('shouldCatch: a filtered error is not sent to the reporter either', () => {
    const reporter = { report: vi.fn() }
    const { stop } = useGlobalErrorCapture({
      reporter,
      shouldCatch: (e) => (e.error as DOMException)?.name !== 'AbortError',
    })

    dispatchWindowError(new DOMException('aborted', 'AbortError'))
    expect(reporter.report).not.toHaveBeenCalled()

    stop()
  })

  it('honors a custom internalErrorPrefix when onError/reporter throw', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { stop } = useGlobalErrorCapture({
      internalErrorPrefix: '[my-app]',
      onError: () => {
        throw new Error('onError boom')
      },
      reporter: {
        report: () => {
          throw new Error('reporter boom')
        },
      },
    })

    dispatchWindowError(new Error('x'))

    expect(spy.mock.calls.length).toBeGreaterThanOrEqual(2)
    for (const call of spy.mock.calls) {
      expect(call[0]).toMatch(/^\[my-app\] /)
    }
    spy.mockRestore()
    stop()
  })

  it('defaults to [vue-error-boundary-kit] when no internalErrorPrefix is given', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { stop } = useGlobalErrorCapture({
      onError: () => {
        throw new Error('boom')
      },
    })

    dispatchWindowError(new Error('x'))

    expect(spy.mock.calls[0]?.[0]).toMatch(/^\[vue-error-boundary-kit\] /)
    spy.mockRestore()
    stop()
  })

  it('is a no-op outside a browser environment', () => {
    vi.stubGlobal('window', undefined)
    const { stop } = useGlobalErrorCapture()
    expect(() => stop()).not.toThrow()
    vi.unstubAllGlobals()
  })
})

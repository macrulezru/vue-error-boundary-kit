import { describe, expect, it, vi } from 'vitest'
import { useErrorBoundary } from '../useErrorBoundary'

describe('useErrorBoundary — case 9: captureError()', () => {
  it('updates error/hasError and calls onError', () => {
    const onError = vi.fn()
    const { error, hasError, captureError } = useErrorBoundary({ onError })

    expect(hasError.value).toBe(false)
    expect(error.value).toBeNull()

    const captured = captureError(new Error('manual boom'), { source: 'event' })

    expect(hasError.value).toBe(true)
    expect(error.value).toBe(captured)
    expect(error.value?.message).toBe('manual boom')
    expect(error.value?.source).toBe('event')
    expect(onError).toHaveBeenCalledTimes(1)
    expect(onError).toHaveBeenCalledWith(captured)
  })

  it('defaults source to "manual" when not specified', () => {
    const { error, captureError } = useErrorBoundary()
    captureError(new Error('x'))
    expect(error.value?.source).toBe('manual')
  })

  it('reset() clears error state and calls beforeReset', () => {
    const beforeReset = vi.fn()
    const { error, hasError, reset, captureError } = useErrorBoundary({ beforeReset })

    captureError(new Error('boom'))
    expect(hasError.value).toBe(true)

    reset()

    expect(hasError.value).toBe(false)
    expect(error.value).toBeNull()
    expect(beforeReset).toHaveBeenCalledTimes(1)
  })

  it('normalizes non-Error thrown values', () => {
    const { error, captureError } = useErrorBoundary()
    captureError('a plain string reason')
    expect(error.value?.message).toBe('a plain string reason')
    expect(error.value?.stack).toBeUndefined()
  })

  it('does not let a throwing onError/reporter break captureError', () => {
    const { error, captureError } = useErrorBoundary({
      onError: () => {
        throw new Error('handler exploded')
      },
      reporter: {
        report: () => {
          throw new Error('reporter exploded')
        },
      },
    })

    expect(() => captureError(new Error('boom'))).not.toThrow()
    expect(error.value?.message).toBe('boom')
  })

  it('uses the default [vue-error-boundary-kit] prefix for the internal safety-net log', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { captureError } = useErrorBoundary({
      onError: () => {
        throw new Error('boom')
      },
    })
    captureError(new Error('x'))
    expect(spy.mock.calls[0]?.[0]).toMatch(/^\[vue-error-boundary-kit\] /)
    spy.mockRestore()
  })

  it('honors a custom internalErrorPrefix for a throwing onError/beforeReset/reporter', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { captureError, reset } = useErrorBoundary({
      internalErrorPrefix: '[my-app]',
      onError: () => {
        throw new Error('onError boom')
      },
      beforeReset: () => {
        throw new Error('beforeReset boom')
      },
      reporter: {
        report: () => {
          throw new Error('reporter boom')
        },
      },
    })

    captureError(new Error('x'))
    reset()

    expect(spy.mock.calls.length).toBeGreaterThanOrEqual(2)
    for (const call of spy.mock.calls) {
      expect(call[0]).toMatch(/^\[my-app\] /)
    }
    spy.mockRestore()
  })

  it('omits the prefix entirely when internalErrorPrefix is an empty string', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { captureError } = useErrorBoundary({
      internalErrorPrefix: '',
      onError: () => {
        throw new Error('boom')
      },
    })
    captureError(new Error('x'))
    expect(spy.mock.calls[0]?.[0]).toBe('error handler/reporter threw:')
    spy.mockRestore()
  })
})

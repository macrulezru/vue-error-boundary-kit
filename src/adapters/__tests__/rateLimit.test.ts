import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createRateLimitedReporter } from '../rateLimit'
import type { SuppressReason } from '../rateLimit'
import type { CapturedError } from '../../types'

function makeError(message = 'boom', overrides: Partial<CapturedError> = {}): CapturedError {
  return {
    error: new Error(message),
    message,
    componentName: 'Widget',
    source: 'render',
    timestamp: 0,
    ...overrides,
  }
}

describe('createRateLimitedReporter', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(0)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('forwards the first occurrence of an error', () => {
    const inner = { report: vi.fn() }
    const reporter = createRateLimitedReporter(inner)

    reporter.report(makeError())

    expect(inner.report).toHaveBeenCalledTimes(1)
  })

  it('dedups identical repeats within the dedup window', () => {
    const inner = { report: vi.fn() }
    const onSuppressed = vi.fn()
    const reporter = createRateLimitedReporter(inner, { dedupWindowMs: 5000, onSuppressed })

    reporter.report(makeError('same'))
    reporter.report(makeError('same'))
    reporter.report(makeError('same'))

    expect(inner.report).toHaveBeenCalledTimes(1)
    expect(onSuppressed).toHaveBeenCalledTimes(2)
    const reasons = onSuppressed.mock.calls.map((c) => c[1].reason as SuppressReason)
    expect(reasons).toEqual(['dedup', 'dedup'])
    expect(onSuppressed.mock.calls[1]?.[1].count).toBe(3)
  })

  it('forwards again once the dedup window has elapsed', () => {
    const inner = { report: vi.fn() }
    const reporter = createRateLimitedReporter(inner, { dedupWindowMs: 1000 })

    reporter.report(makeError('same'))
    vi.setSystemTime(2000)
    reporter.report(makeError('same'))

    expect(inner.report).toHaveBeenCalledTimes(2)
  })

  it('distinguishes errors by source + componentName + message', () => {
    const inner = { report: vi.fn() }
    const reporter = createRateLimitedReporter(inner, { dedupWindowMs: 5000 })

    reporter.report(makeError('a', { componentName: 'A' }))
    reporter.report(makeError('a', { componentName: 'B' }))
    reporter.report(makeError('b', { componentName: 'A' }))

    expect(inner.report).toHaveBeenCalledTimes(3)
  })

  it('caps forwarded reports at maxPerWindow, suppressing the rest with reason "rate-limit"', () => {
    const inner = { report: vi.fn() }
    const onSuppressed = vi.fn()
    const reporter = createRateLimitedReporter(inner, {
      maxPerWindow: 2,
      windowMs: 10_000,
      onSuppressed,
    })

    reporter.report(makeError('a'))
    reporter.report(makeError('b'))
    reporter.report(makeError('c'))

    expect(inner.report).toHaveBeenCalledTimes(2)
    expect(onSuppressed).toHaveBeenCalledTimes(1)
    expect(onSuppressed.mock.calls[0]?.[1].reason).toBe('rate-limit')
  })

  it('resets the rate-limit window after windowMs elapses', () => {
    const inner = { report: vi.fn() }
    const reporter = createRateLimitedReporter(inner, { maxPerWindow: 1, windowMs: 1000 })

    reporter.report(makeError('a'))
    reporter.report(makeError('b')) // suppressed — window full
    vi.setSystemTime(1500)
    reporter.report(makeError('c')) // new window

    expect(inner.report).toHaveBeenCalledTimes(2)
  })

  it('forwards to every wrapped reporter, and one throwing does not block the others', () => {
    const a = { report: vi.fn() }
    const b = {
      report: vi.fn(() => {
        throw new Error('a reporter exploded')
      }),
    }
    const c = { report: vi.fn() }
    const reporter = createRateLimitedReporter([b, a, c])

    expect(() => reporter.report(makeError())).not.toThrow()

    expect(a.report).toHaveBeenCalledTimes(1)
    expect(c.report).toHaveBeenCalledTimes(1)
  })

  it('a throwing onSuppressed callback does not break reporting', () => {
    const inner = { report: vi.fn() }
    const onSuppressed = vi.fn(() => {
      throw new Error('boom')
    })
    const reporter = createRateLimitedReporter(inner, { dedupWindowMs: 5000, onSuppressed })

    reporter.report(makeError('same'))
    expect(() => reporter.report(makeError('same'))).not.toThrow()
  })

  it('honors a custom internalErrorPrefix when onSuppressed/a wrapped reporter throw', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const failingInner = {
      report: () => {
        throw new Error('inner boom')
      },
    }
    const onSuppressed = vi.fn(() => {
      throw new Error('onSuppressed boom')
    })
    const reporter = createRateLimitedReporter(failingInner, {
      dedupWindowMs: 5000,
      internalErrorPrefix: '[my-app]',
      onSuppressed,
    })

    reporter.report(makeError('same')) // forwarded to failingInner -> logs once
    reporter.report(makeError('same')) // deduped -> onSuppressed throws -> logs once

    expect(spy.mock.calls.length).toBeGreaterThanOrEqual(2)
    for (const call of spy.mock.calls) {
      expect(call[0]).toMatch(/^\[my-app\] /)
    }
    spy.mockRestore()
  })

  it('defaults to [vue-error-boundary-kit] when no internalErrorPrefix is given', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const failingInner = {
      report: () => {
        throw new Error('inner boom')
      },
    }
    const reporter = createRateLimitedReporter(failingInner)

    reporter.report(makeError())

    expect(spy.mock.calls[0]?.[0]).toMatch(/^\[vue-error-boundary-kit\] /)
    spy.mockRestore()
  })
})

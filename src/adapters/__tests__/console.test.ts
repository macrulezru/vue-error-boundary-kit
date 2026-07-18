import { describe, expect, it, vi } from 'vitest'
import { consoleReporter, createConsoleReporter } from '../console'
import type { CapturedError } from '../../types'

function makeError(overrides: Partial<CapturedError> = {}): CapturedError {
  return {
    error: new Error('boom'),
    message: 'boom',
    source: 'render',
    timestamp: 0,
    ...overrides,
  }
}

describe('createConsoleReporter', () => {
  it('logs via console.error by default', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    consoleReporter.report(makeError())
    expect(spy).toHaveBeenCalledTimes(1)
    expect(spy.mock.calls[0]?.[0]).toContain('boom')
    spy.mockRestore()
  })

  it('logs via a custom logger when provided', () => {
    const logger = { error: vi.fn() }
    const reporter = createConsoleReporter({ logger })
    const error = makeError({ message: 'custom logger boom', source: 'event' })

    reporter.report(error, { extra: 1 })

    expect(logger.error).toHaveBeenCalledTimes(1)
    const [message, payload] = logger.error.mock.calls[0] ?? []
    expect(String(message)).toContain('event')
    expect(String(message)).toContain('custom logger boom')
    expect(payload).toMatchObject({ error, context: { extra: 1 } })
  })

  it('defaults to the [vue-error-boundary-kit] prefix', () => {
    const logger = { error: vi.fn() }
    createConsoleReporter({ logger }).report(makeError())
    expect(logger.error.mock.calls[0]?.[0]).toMatch(/^\[vue-error-boundary-kit\] /)
  })

  it('uses a custom prefix when provided', () => {
    const logger = { error: vi.fn() }
    createConsoleReporter({ logger, prefix: '[my-app]' }).report(makeError())
    expect(logger.error.mock.calls[0]?.[0]).toMatch(/^\[my-app\] /)
  })

  it('omits the prefix entirely when set to an empty string', () => {
    const logger = { error: vi.fn() }
    createConsoleReporter({ logger, prefix: '' }).report(
      makeError({ source: 'event', message: 'no prefix' }),
    )
    expect(logger.error.mock.calls[0]?.[0]).toBe('(event) no prefix')
  })
})

import { describe, expect, it, vi } from 'vitest'
import { createLogRocketReporter } from '../logrocket'
import type { CapturedError } from '../../types'

function makeError(overrides: Partial<CapturedError> = {}): CapturedError {
  return {
    error: new Error('logrocket boom'),
    message: 'logrocket boom',
    componentName: 'UserProfile',
    source: 'render',
    timestamp: 123,
    ...overrides,
  }
}

describe('createLogRocketReporter', () => {
  it('calls client.captureException with the raw error and tags', () => {
    const rawError = new Error('raw')
    const client = { captureException: vi.fn() }
    const reporter = createLogRocketReporter({ client, tags: { team: 'frontend' } })

    reporter.report(makeError({ error: rawError }))

    expect(client.captureException).toHaveBeenCalledTimes(1)
    const [passedError, options] = client.captureException.mock.calls[0] ?? []
    expect(passedError).toBe(rawError)
    expect(options.tags).toEqual({ team: 'frontend' })
  })

  it('flattens CapturedError fields and context into scalar extra', () => {
    const client = { captureException: vi.fn() }
    const reporter = createLogRocketReporter({ client })

    reporter.report(makeError(), { userId: '42', count: 3, active: true })

    const [, options] = client.captureException.mock.calls[0] ?? []
    expect(options.extra).toMatchObject({
      message: 'logrocket boom',
      source: 'render',
      componentName: 'UserProfile',
      timestamp: 123,
      userId: '42',
      count: 3,
      active: true,
    })
  })

  it('stringifies non-scalar context values (LogRocket requires scalar extra)', () => {
    const client = { captureException: vi.fn() }
    const reporter = createLogRocketReporter({ client })

    reporter.report(makeError(), { meta: { nested: true } })

    const [, options] = client.captureException.mock.calls[0] ?? []
    expect(typeof options.extra.meta).toBe('string')
    expect(JSON.parse(options.extra.meta)).toEqual({ nested: true })
  })

  it('omits undefined optional fields rather than passing them through', () => {
    const client = { captureException: vi.fn() }
    const reporter = createLogRocketReporter({ client })

    reporter.report(
      makeError({ componentName: undefined, lifecycleHook: undefined, stack: undefined }),
    )

    const [, options] = client.captureException.mock.calls[0] ?? []
    expect('componentName' in options.extra).toBe(false)
    expect('lifecycleHook' in options.extra).toBe(false)
    expect('stack' in options.extra).toBe(false)
  })
})

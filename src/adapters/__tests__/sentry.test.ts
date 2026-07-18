import { describe, expect, it, vi } from 'vitest'
import { createSentryReporter } from '../sentry'
import type { CapturedError } from '../../types'

describe('createSentryReporter', () => {
  it('forwards the raw error to client.captureException with boundary context', () => {
    const client = { captureException: vi.fn().mockReturnValue('event-id') }
    const reporter = createSentryReporter({ client, tags: { team: 'frontend' } })

    const rawError = new Error('sentry boom')
    const captured: CapturedError = {
      error: rawError,
      message: 'sentry boom',
      componentName: 'UserProfile',
      lifecycleHook: 'render function',
      source: 'render',
      timestamp: 123,
    }

    reporter.report(captured, { userId: '42' })

    expect(client.captureException).toHaveBeenCalledTimes(1)
    const [passedError, hint] = client.captureException.mock.calls[0] ?? []
    expect(passedError).toBe(rawError)
    expect(hint.tags).toEqual({ team: 'frontend' })
    expect(hint.extra).toEqual({ userId: '42' })
    expect(hint.contexts.errorBoundary).toMatchObject({
      message: 'sentry boom',
      componentName: 'UserProfile',
      source: 'render',
    })
  })
})

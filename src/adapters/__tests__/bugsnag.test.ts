import { describe, expect, it, vi } from 'vitest'
import { createBugsnagReporter } from '../bugsnag'
import type { CapturedError } from '../../types'
import type { BugsnagEventLike } from '../bugsnag'

function makeError(overrides: Partial<CapturedError> = {}): CapturedError {
  return {
    error: new Error('bugsnag boom'),
    message: 'bugsnag boom',
    componentName: 'UserProfile',
    lifecycleHook: 'render function',
    source: 'render',
    timestamp: 123,
    ...overrides,
  }
}

function makeEvent(): BugsnagEventLike & {
  addMetadata: ReturnType<typeof vi.fn<BugsnagEventLike['addMetadata']>>
} {
  return { addMetadata: vi.fn<BugsnagEventLike['addMetadata']>() }
}

describe('createBugsnagReporter', () => {
  it('calls client.notify with the raw error', () => {
    const rawError = new Error('raw')
    const client = { notify: vi.fn() }
    const reporter = createBugsnagReporter({ client })

    reporter.report(makeError({ error: rawError }))

    expect(client.notify).toHaveBeenCalledTimes(1)
    expect(client.notify.mock.calls[0]?.[0]).toBe(rawError)
  })

  it('sets severity and context, and adds errorBoundary metadata via the onError callback', () => {
    const client = { notify: vi.fn() }
    const reporter = createBugsnagReporter({ client, severity: 'error' })
    const event = makeEvent()

    reporter.report(makeError(), { userId: '42' })

    const onError = client.notify.mock.calls[0]?.[1] as (e: BugsnagEventLike) => void
    onError(event)

    expect(event.severity).toBe('error')
    expect(event.context).toBe('UserProfile')
    expect(event.addMetadata).toHaveBeenCalledWith(
      'errorBoundary',
      expect.objectContaining({ message: 'bugsnag boom', source: 'render', userId: '42' }),
    )
  })

  it('does not set severity/context when not provided/available', () => {
    const client = { notify: vi.fn() }
    const reporter = createBugsnagReporter({ client })
    const event = makeEvent()

    reporter.report(makeError({ componentName: undefined }))
    const onError = client.notify.mock.calls[0]?.[1] as (e: BugsnagEventLike) => void
    onError(event)

    expect(event.severity).toBeUndefined()
    expect(event.context).toBeUndefined()
  })
})

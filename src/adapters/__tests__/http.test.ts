import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createHttpReporter } from '../http'
import type { CapturedError } from '../../types'

function makeError(message = 'boom'): CapturedError {
  return { error: new Error(message), message, source: 'render', timestamp: 0 }
}

describe('createHttpReporter', () => {
  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    fetchMock = vi.fn().mockResolvedValue({ ok: true })
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  it('POSTs immediately when batching is disabled (default)', async () => {
    const reporter = createHttpReporter({ endpoint: '/errors' })
    reporter.report(makeError('immediate'))

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0] ?? []
    expect(url).toBe('/errors')
    expect(init.method).toBe('POST')
    const body = JSON.parse(init.body)
    expect(body.message).toBe('immediate')
  })

  it('batches reports within the interval into a single request', () => {
    vi.useFakeTimers()
    const reporter = createHttpReporter({ endpoint: '/errors', batchInterval: 100 })

    reporter.report(makeError('a'))
    reporter.report(makeError('b'))
    expect(fetchMock).not.toHaveBeenCalled()

    vi.advanceTimersByTime(100)

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const body = JSON.parse(fetchMock.mock.calls[0]?.[1].body)
    expect(body).toHaveLength(2)
    expect(body.map((e: CapturedError) => e.message)).toEqual(['a', 'b'])
  })

  it('flushes early once maxBatchSize is reached', () => {
    vi.useFakeTimers()
    const reporter = createHttpReporter({
      endpoint: '/errors',
      batchInterval: 1000,
      maxBatchSize: 2,
    })

    reporter.report(makeError('a'))
    expect(fetchMock).not.toHaveBeenCalled()
    reporter.report(makeError('b'))

    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('sends custom headers merged with the default content type', () => {
    const reporter = createHttpReporter({
      endpoint: '/errors',
      headers: { Authorization: 'Bearer x' },
    })
    reporter.report(makeError())
    const [, init] = fetchMock.mock.calls[0] ?? []
    expect(init.headers).toMatchObject({
      'Content-Type': 'application/json',
      Authorization: 'Bearer x',
    })
  })

  it('uses navigator.sendBeacon to flush the pending batch on pagehide', () => {
    vi.useFakeTimers()
    const sendBeacon = vi.fn().mockReturnValue(true)
    vi.stubGlobal('navigator', { sendBeacon })

    const reporter = createHttpReporter({ endpoint: '/errors', batchInterval: 5000 })
    reporter.report(makeError('pending'))
    expect(fetchMock).not.toHaveBeenCalled()

    document.dispatchEvent(new Event('pagehide'))

    expect(sendBeacon).toHaveBeenCalledTimes(1)
    expect(sendBeacon.mock.calls[0]?.[0]).toBe('/errors')
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

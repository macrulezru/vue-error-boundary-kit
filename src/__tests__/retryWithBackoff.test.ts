import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import { createBackoffRetry } from '../retryWithBackoff'

function makeBoundary(retryCount = 0) {
  return { retry: vi.fn(), retryCount }
}

describe('createBackoffRetry', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('schedules the wrapped retry() after baseDelayMs on the first attempt', () => {
    const boundary = makeBoundary(0)
    const boundaryRef = ref(boundary)
    const backoff = createBackoffRetry(boundaryRef, { baseDelayMs: 1000 })

    backoff.retry()
    expect(backoff.isPending.value).toBe(true)
    expect(boundary.retry).not.toHaveBeenCalled()

    vi.advanceTimersByTime(999)
    expect(boundary.retry).not.toHaveBeenCalled()

    vi.advanceTimersByTime(1)
    expect(boundary.retry).toHaveBeenCalledTimes(1)
    expect(backoff.isPending.value).toBe(false)
  })

  it("computes an exponentially increasing delay from the boundary's retryCount", () => {
    const boundary = makeBoundary(3)
    const boundaryRef = ref(boundary)
    const backoff = createBackoffRetry(boundaryRef, { baseDelayMs: 1000, factor: 2 })

    backoff.retry()
    vi.advanceTimersByTime(1000 * 2 ** 3 - 1)
    expect(boundary.retry).not.toHaveBeenCalled()

    vi.advanceTimersByTime(1)
    expect(boundary.retry).toHaveBeenCalledTimes(1)
  })

  it('caps the delay at maxDelayMs', () => {
    const boundary = makeBoundary(20) // 1000 * 2**20 would be enormous without the cap
    const boundaryRef = ref(boundary)
    const backoff = createBackoffRetry(boundaryRef, {
      baseDelayMs: 1000,
      factor: 2,
      maxDelayMs: 5000,
    })

    backoff.retry()
    vi.advanceTimersByTime(4999)
    expect(boundary.retry).not.toHaveBeenCalled()

    vi.advanceTimersByTime(1)
    expect(boundary.retry).toHaveBeenCalledTimes(1)
  })

  it('is a no-op while a retry is already pending', () => {
    const boundary = makeBoundary(0)
    const boundaryRef = ref(boundary)
    const backoff = createBackoffRetry(boundaryRef, { baseDelayMs: 1000 })

    backoff.retry()
    backoff.retry()
    backoff.retry()
    vi.advanceTimersByTime(1000)

    expect(boundary.retry).toHaveBeenCalledTimes(1)
  })

  it('cancel() clears a pending retry', () => {
    const boundary = makeBoundary(0)
    const boundaryRef = ref(boundary)
    const backoff = createBackoffRetry(boundaryRef, { baseDelayMs: 1000 })

    backoff.retry()
    backoff.cancel()
    expect(backoff.isPending.value).toBe(false)

    vi.advanceTimersByTime(2000)
    expect(boundary.retry).not.toHaveBeenCalled()
  })

  it('cancel() is a harmless no-op when nothing is pending', () => {
    const boundaryRef = ref(makeBoundary(0))
    const backoff = createBackoffRetry(boundaryRef)
    expect(() => backoff.cancel()).not.toThrow()
  })

  it('is a no-op if the ref is null (e.g. the boundary unmounted before the click)', () => {
    const boundaryRef = ref(null)
    const backoff = createBackoffRetry(boundaryRef)
    expect(() => backoff.retry()).not.toThrow()
    expect(backoff.isPending.value).toBe(false)
  })

  it('re-reads the ref when the timer fires, so an unmounted boundary is not retried', () => {
    const boundary = makeBoundary(0)
    const boundaryRef = ref<typeof boundary | null>(boundary)
    const backoff = createBackoffRetry(boundaryRef, { baseDelayMs: 1000 })

    backoff.retry()
    boundaryRef.value = null
    vi.advanceTimersByTime(1000)

    expect(boundary.retry).not.toHaveBeenCalled()
  })
})

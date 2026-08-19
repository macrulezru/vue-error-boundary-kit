import { describe, expect, it, vi } from 'vitest'
import { createBreadcrumbTrail, withBreadcrumbs } from '../breadcrumbs'
import type { CapturedError } from '../../types'

function makeError(message = 'boom', overrides: Partial<CapturedError> = {}): CapturedError {
  return { error: new Error(message), message, source: 'render', timestamp: 0, ...overrides }
}

describe('createBreadcrumbTrail', () => {
  it('records breadcrumbs in chronological order (oldest first)', () => {
    const trail = createBreadcrumbTrail()
    trail.addBreadcrumb({ category: 'nav', message: 'went to /a' })
    trail.addBreadcrumb({ category: 'nav', message: 'went to /b' })

    expect(trail.entries.value.map((b) => b.message)).toEqual(['went to /a', 'went to /b'])
  })

  it('defaults timestamp to Date.now() but respects an explicit one', () => {
    vi.useFakeTimers()
    vi.setSystemTime(1000)
    const trail = createBreadcrumbTrail()

    trail.addBreadcrumb({ category: 'nav', message: 'auto' })
    trail.addBreadcrumb({ category: 'nav', message: 'explicit', timestamp: 42 })

    expect(trail.entries.value[0]?.timestamp).toBe(1000)
    expect(trail.entries.value[1]?.timestamp).toBe(42)
    vi.useRealTimers()
  })

  it('evicts the oldest breadcrumb once the limit is exceeded', () => {
    const trail = createBreadcrumbTrail({ limit: 2 })
    trail.addBreadcrumb({ category: 'c', message: 'a' })
    trail.addBreadcrumb({ category: 'c', message: 'b' })
    trail.addBreadcrumb({ category: 'c', message: 'c' })

    expect(trail.entries.value.map((b) => b.message)).toEqual(['b', 'c'])
  })

  it('clear() empties the trail', () => {
    const trail = createBreadcrumbTrail()
    trail.addBreadcrumb({ category: 'c', message: 'a' })
    trail.clear()
    expect(trail.entries.value).toHaveLength(0)
  })

  it('.record is an ErrorReporter that auto-adds an "error" category breadcrumb', () => {
    const trail = createBreadcrumbTrail()
    trail.record.report(makeError('boom', { componentName: 'Widget' }))

    expect(trail.entries.value).toHaveLength(1)
    expect(trail.entries.value[0]).toMatchObject({
      category: 'error',
      message: 'boom',
      data: { source: 'render', componentName: 'Widget' },
    })
  })
})

describe('withBreadcrumbs', () => {
  it("merges the trail's current entries into report()'s context under 'breadcrumbs'", () => {
    const trail = createBreadcrumbTrail()
    trail.addBreadcrumb({ category: 'nav', message: 'went to /a' })
    const inner = { report: vi.fn() }
    const reporter = withBreadcrumbs(inner, { trail })

    reporter.report(makeError(), { userId: '42' })

    expect(inner.report).toHaveBeenCalledWith(expect.objectContaining({ message: 'boom' }), {
      userId: '42',
      breadcrumbs: trail.entries.value,
    })
  })

  it('supports a custom contextKey and forwards to multiple reporters', () => {
    const trail = createBreadcrumbTrail()
    const a = { report: vi.fn() }
    const b = { report: vi.fn() }
    const reporter = withBreadcrumbs([a, b], { trail, contextKey: 'trail' })

    reporter.report(makeError())

    expect(a.report).toHaveBeenCalledWith(expect.anything(), { trail: [] })
    expect(b.report).toHaveBeenCalledWith(expect.anything(), { trail: [] })
  })

  it("a wrapped reporter that throws doesn't block the others, and is logged via the safety net", () => {
    const good = { report: vi.fn() }
    const bad = {
      report: vi.fn(() => {
        throw new Error('reporter exploded')
      }),
    }
    const trail = createBreadcrumbTrail()
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const reporter = withBreadcrumbs([bad, good], { trail })
    reporter.report(makeError())

    expect(good.report).toHaveBeenCalledTimes(1)
    expect(consoleSpy).toHaveBeenCalled()
    consoleSpy.mockRestore()
  })
})

import { describe, expect, it, vi } from 'vitest'
import { createOtelReporter } from '../otel'
import type { OtelSpanLike } from '../otel'
import type { CapturedError } from '../../types'

function makeSpan(): OtelSpanLike & {
  recordException: ReturnType<typeof vi.fn<OtelSpanLike['recordException']>>
  setStatus: ReturnType<typeof vi.fn<OtelSpanLike['setStatus']>>
  setAttribute: ReturnType<typeof vi.fn<OtelSpanLike['setAttribute']>>
  end: ReturnType<typeof vi.fn<OtelSpanLike['end']>>
} {
  return {
    recordException: vi.fn<OtelSpanLike['recordException']>(),
    setStatus: vi.fn<OtelSpanLike['setStatus']>(),
    setAttribute: vi.fn<OtelSpanLike['setAttribute']>(),
    end: vi.fn<OtelSpanLike['end']>(),
  }
}

describe('createOtelReporter', () => {
  it('starts a span, records the exception, sets ERROR status, and ends the span', () => {
    const span = makeSpan()
    const tracer = { startSpan: vi.fn().mockReturnValue(span) }
    const reporter = createOtelReporter({ tracer })

    const captured: CapturedError = {
      error: new Error('otel boom'),
      message: 'otel boom',
      stack: 'Error: otel boom\n    at ...',
      componentName: 'UserProfile',
      source: 'render',
      timestamp: 123,
    }

    reporter.report(captured)

    expect(tracer.startSpan).toHaveBeenCalledWith('error-boundary-kit.error')
    expect(span.recordException).toHaveBeenCalledWith({
      message: 'otel boom',
      stack: captured.stack,
    })
    expect(span.setStatus).toHaveBeenCalledWith({ code: 2, message: 'otel boom' })
    expect(span.setAttribute).toHaveBeenCalledWith('componentName', 'UserProfile')
    expect(span.setAttribute).toHaveBeenCalledWith('source', 'render')
    expect(span.end).toHaveBeenCalledTimes(1)
  })

  it('uses a custom span name and merges extra attributes with report-time context', () => {
    const span = makeSpan()
    const tracer = { startSpan: vi.fn().mockReturnValue(span) }
    const reporter = createOtelReporter({
      tracer,
      spanName: 'my-app.error',
      attributes: { team: 'frontend' },
    })

    reporter.report(
      {
        error: new Error('x'),
        message: 'x',
        source: 'manual',
        timestamp: 1,
      },
      { userId: '42' },
    )

    expect(tracer.startSpan).toHaveBeenCalledWith('my-app.error')
    expect(span.setAttribute).toHaveBeenCalledWith('team', 'frontend')
    expect(span.setAttribute).toHaveBeenCalledWith('userId', '42')
  })

  it('never sets an attribute for undefined optional fields', () => {
    const span = makeSpan()
    const reporter = createOtelReporter({ tracer: { startSpan: () => span } })

    reporter.report({ error: new Error('x'), message: 'x', source: 'manual', timestamp: 1 })

    const setKeys = span.setAttribute.mock.calls.map((call) => call[0])
    expect(setKeys).not.toContain('stack')
    expect(setKeys).not.toContain('componentName')
    expect(setKeys).not.toContain('lifecycleHook')
  })
})

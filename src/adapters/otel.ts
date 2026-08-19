import type { CapturedError, ErrorReporter } from '../types'
import { corePayloadFields, toScalarRecord } from './_shared'

/** Structural subset of @opentelemetry/api's `Span` this adapter needs. */
export interface OtelSpanLike {
  recordException(exception: { message: string; stack?: string }): unknown
  setStatus(status: { code: number; message?: string }): unknown
  setAttribute(key: string, value: string | number | boolean): unknown
  end(): unknown
}

/** Structural subset of @opentelemetry/api's `Tracer` this adapter needs. */
export interface OtelTracerLike {
  startSpan(name: string): OtelSpanLike
}

export interface OtelReporterOptions {
  /**
   * An already-initialized OTel tracer (e.g. `trace.getTracer('my-app')`) — `@opentelemetry/api`
   * is never imported by this package. A fresh span is started per error, so this doesn't depend
   * on there being an active span already; if you'd rather attach errors to the current span
   * instead of a standalone one, pass a tiny wrapper: `{ startSpan: () => trace.getActiveSpan()
   * ?? realTracer.startSpan(name) }`.
   */
  tracer: OtelTracerLike
  /** Span name for each recorded error. Default: 'error-boundary-kit.error'. */
  spanName?: string
  /** Extra span attributes attached to every recorded error, alongside the CapturedError fields. */
  attributes?: Record<string, string | number | boolean>
}

// @opentelemetry/api's SpanStatusCode.ERROR — hardcoded (not imported) so this stays a
// structurally-typed wrapper like the Sentry/Bugsnag/LogRocket adapters; verified against
// @opentelemetry/api@1.9.1's trace/status.d.ts (`enum SpanStatusCode { UNSET = 0, OK = 1, ERROR = 2 }`).
const OTEL_SPAN_STATUS_CODE_ERROR = 2

/**
 * Records a CapturedError as an OTel exception event: starts a span, calls `recordException()`
 * + `setStatus({ code: ERROR })`, attaches the CapturedError's fields (plus any extra `attributes`
 * and report-time `context`) as span attributes, then ends the span.
 */
export function createOtelReporter(options: OtelReporterOptions): ErrorReporter {
  const { tracer, spanName = 'error-boundary-kit.error', attributes } = options
  return {
    report(error: CapturedError, context?: Record<string, unknown>) {
      const span = tracer.startSpan(spanName)
      span.recordException({ message: error.message, stack: error.stack })
      span.setStatus({ code: OTEL_SPAN_STATUS_CODE_ERROR, message: error.message })
      const fields = { ...corePayloadFields(error), ...toScalarRecord(context), ...attributes }
      for (const [key, value] of Object.entries(fields)) {
        if (value !== undefined) span.setAttribute(key, value)
      }
      span.end()
    },
  }
}

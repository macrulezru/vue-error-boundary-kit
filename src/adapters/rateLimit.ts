import type { CapturedError, ErrorReporter } from '../types'
import { safeInvoke, safeInvokeAsync, toArray } from '../internal'

export type SuppressReason = 'dedup' | 'rate-limit'

export interface RateLimitOptions {
  /** Max reports forwarded within windowMs, across all error signatures. Default: 10. */
  maxPerWindow?: number
  /** Window size in ms for maxPerWindow. Default: 10_000 (10s). */
  windowMs?: number
  /**
   * Suppress repeats of the identical error (same source + componentName + message) within this
   * window — only the first occurrence is forwarded. Default: same as windowMs.
   */
  dedupWindowMs?: number
  /** Called whenever a report is suppressed, with the running count for that signature/window. */
  onSuppressed?: (error: CapturedError, info: { reason: SuppressReason; count: number }) => void
  /**
   * Prefix for the internal safety-net log emitted when onSuppressed or one of the wrapped
   * reporters itself throws. Default: '[vue-error-boundary-kit]'. Pass '' to omit it entirely.
   */
  internalErrorPrefix?: string
}

function dedupKey(error: CapturedError): string {
  return `${error.source}:${error.componentName ?? ''}:${error.message}`
}

// If a session throws many DISTINCT error signatures (the "mass failure" scenario this exists
// for), the dedup map would otherwise grow forever. Sweep stale entries once it gets large,
// rather than on every call.
const SWEEP_THRESHOLD = 1000

/**
 * Wraps one or more reporters with dedup + rate-limiting, so a mass failure (e.g. a broken list
 * re-rendering hundreds of times a second) doesn't spam the underlying reporter(s).
 */
export function createRateLimitedReporter(
  reporter: ErrorReporter | ErrorReporter[],
  options: RateLimitOptions = {},
): ErrorReporter {
  const {
    maxPerWindow = 10,
    windowMs = 10_000,
    dedupWindowMs = windowMs,
    onSuppressed,
    internalErrorPrefix,
  } = options
  const reporters = toArray(reporter)

  let windowStart = 0
  let windowCount = 0
  const seen = new Map<string, { firstAt: number; count: number }>()

  return {
    report(error: CapturedError, context?: Record<string, unknown>) {
      const now = Date.now()

      if (seen.size >= SWEEP_THRESHOLD) {
        for (const [key, entry] of seen) {
          if (now - entry.firstAt >= dedupWindowMs) seen.delete(key)
        }
      }

      const key = dedupKey(error)
      const existing = seen.get(key)
      if (existing && now - existing.firstAt < dedupWindowMs) {
        existing.count++
        safeInvoke(
          () => onSuppressed?.(error, { reason: 'dedup', count: existing.count }),
          internalErrorPrefix,
        )
        return
      }
      seen.set(key, { firstAt: now, count: 1 })

      if (now - windowStart >= windowMs) {
        windowStart = now
        windowCount = 0
      }
      if (windowCount >= maxPerWindow) {
        safeInvoke(
          () => onSuppressed?.(error, { reason: 'rate-limit', count: windowCount + 1 }),
          internalErrorPrefix,
        )
        return
      }
      windowCount++

      for (const r of reporters) {
        safeInvokeAsync(() => r.report(error, context), internalErrorPrefix)
      }
    },
  }
}

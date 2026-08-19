import { shallowRef, type ShallowRef } from 'vue'
import type { CapturedError, ErrorReporter } from '../types'
import { safeInvokeAsync, toArray } from '../internal'

export interface Breadcrumb {
  category: string
  message: string
  timestamp: number
  data?: Record<string, unknown>
}

export interface AddBreadcrumbInput {
  category: string
  message: string
  /** Defaults to `Date.now()`. */
  timestamp?: number
  data?: Record<string, unknown>
}

export interface BreadcrumbTrailOptions {
  /** Max breadcrumbs kept, oldest evicted first. Default: 20. */
  limit?: number
}

export interface BreadcrumbTrail {
  /**
   * Chronological order, oldest first — the most recent breadcrumb is `entries.value.at(-1)`.
   * Deliberately the opposite order from `createErrorHistory()`'s `entries` (most-recent-first,
   * a debug-log convention): a breadcrumb trail reads as a timeline leading up to the error, the
   * same convention Sentry and most APM tools use for breadcrumbs.
   */
  entries: ShallowRef<Breadcrumb[]>
  addBreadcrumb(breadcrumb: AddBreadcrumbInput): void
  /** An ErrorReporter — pass it alongside your real reporter(s) to auto-record every captured error as a breadcrumb too, so a later error's trail shows earlier ones. */
  record: ErrorReporter
  clear(): void
}

/**
 * A rolling window of "things that happened before the error" you attach to reports via
 * `withBreadcrumbs()`. Nothing is auto-instrumented — call `addBreadcrumb()` yourself from
 * wherever you already have the information (a router `afterEach` hook, a global click listener,
 * a state-management action), the same opt-in spirit as `useGlobalErrorCapture()`.
 */
export function createBreadcrumbTrail(options: BreadcrumbTrailOptions = {}): BreadcrumbTrail {
  const limit = options.limit ?? 20
  const entries = shallowRef<Breadcrumb[]>([])

  function addBreadcrumb(breadcrumb: AddBreadcrumbInput): void {
    const entry: Breadcrumb = { ...breadcrumb, timestamp: breadcrumb.timestamp ?? Date.now() }
    entries.value = [...entries.value, entry].slice(-limit)
  }

  return {
    entries,
    addBreadcrumb,
    record: {
      report(error: CapturedError) {
        addBreadcrumb({
          category: 'error',
          message: error.message,
          data: { source: error.source, componentName: error.componentName },
        })
      },
    },
    clear() {
      entries.value = []
    },
  }
}

export interface WithBreadcrumbsOptions {
  trail: BreadcrumbTrail
  /** Key the current breadcrumbs are merged into report()'s context under. Default: 'breadcrumbs'. */
  contextKey?: string
  /**
   * Prefix for the internal safety-net log if a wrapped reporter itself throws.
   * Default: '[vue-error-boundary-kit]'. Pass '' to omit it.
   */
  internalErrorPrefix?: string
}

/** Wraps reporter(s) so every `report()` call's context includes the trail's current breadcrumbs. */
export function withBreadcrumbs(
  reporter: ErrorReporter | ErrorReporter[],
  options: WithBreadcrumbsOptions,
): ErrorReporter {
  const reporters = toArray(reporter)
  const { trail, contextKey = 'breadcrumbs', internalErrorPrefix } = options

  return {
    report(error: CapturedError, context?: Record<string, unknown>) {
      const merged = { ...context, [contextKey]: trail.entries.value }
      for (const r of reporters) {
        safeInvokeAsync(() => r.report(error, merged), internalErrorPrefix)
      }
    },
  }
}

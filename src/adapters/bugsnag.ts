import type { CapturedError, ErrorReporter } from '../types'
import { corePayloadFields } from './_shared'

/**
 * Structural subset of the Bugsnag JS client's notify() API this adapter needs — matches
 * https://docs.bugsnag.com/platforms/javascript/reporting-handled-errors/ closely enough to
 * accept the real client, without depending on @bugsnag/js as a package dependency.
 */
export interface BugsnagEventLike {
  severity?: 'info' | 'warning' | 'error'
  context?: string
  groupingHash?: string
  addMetadata(section: string, values: Record<string, unknown>): void
}

export interface BugsnagLikeClient {
  notify(error: unknown, onError?: (event: BugsnagEventLike) => void): void
}

export interface BugsnagReporterOptions {
  /** An already-initialized Bugsnag client (Bugsnag.start()'s return value, or the Bugsnag default export) — this package never imports @bugsnag/js itself. */
  client: BugsnagLikeClient
  /** Severity forwarded to every event. Bugsnag defaults to 'warning' for notify() calls. */
  severity?: BugsnagEventLike['severity']
}

/** Thin wrapper around an externally-initialized Bugsnag client — @bugsnag/js is a peer, not a dependency. */
export function createBugsnagReporter(options: BugsnagReporterOptions): ErrorReporter {
  const { client, severity } = options
  return {
    report(error: CapturedError, context?: Record<string, unknown>) {
      client.notify(error.error, (event) => {
        if (severity) event.severity = severity
        if (error.componentName) event.context = error.componentName
        event.addMetadata('errorBoundary', { ...corePayloadFields(error), ...context })
      })
    },
  }
}

import type { CapturedError, ErrorReporter } from '../types'

/**
 * Structural subset of the Sentry client API this adapter needs. Matches @sentry/vue's
 * `getCurrentHub().getClient()` / top-level `captureException` shape closely enough to accept
 * either, without depending on @sentry/vue as a package dependency.
 */
export interface SentryLikeClient {
  captureException(error: unknown, hint?: Record<string, unknown>): string | undefined
}

export interface SentryReporterOptions {
  /** An already-initialized Sentry client/instance — this package never imports @sentry/vue itself. */
  client: SentryLikeClient
  /** Extra tags attached to every captured exception. */
  tags?: Record<string, string>
}

/** Thin wrapper around an externally-initialized Sentry client — @sentry/vue is a peer, not a dependency. */
export function createSentryReporter(options: SentryReporterOptions): ErrorReporter {
  const { client, tags } = options
  return {
    report(error: CapturedError, context?: Record<string, unknown>) {
      client.captureException(error.error, {
        contexts: {
          errorBoundary: {
            message: error.message,
            componentName: error.componentName,
            lifecycleHook: error.lifecycleHook,
            source: error.source,
            timestamp: error.timestamp,
          },
        },
        tags,
        extra: context,
      })
    },
  }
}

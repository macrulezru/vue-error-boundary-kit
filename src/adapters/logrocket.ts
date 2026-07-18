import type { CapturedError, ErrorReporter } from '../types'
import { corePayloadFields, toScalarRecord } from './_shared'

/**
 * Structural subset of the LogRocket JS SDK's captureException() API this adapter needs —
 * matches https://docs.logrocket.com/reference/capture-exception closely enough to accept the
 * real client, without depending on the `logrocket` package as a dependency.
 */
export interface LogRocketLikeClient {
  captureException(
    error: unknown,
    options?: { tags?: Record<string, string>; extra?: Record<string, unknown> },
  ): void
}

export interface LogRocketReporterOptions {
  /** The already-initialized LogRocket module (`import LogRocket from 'logrocket'`) — this package never imports logrocket itself. */
  client: LogRocketLikeClient
  /** Tags attached to every captured exception. */
  tags?: Record<string, string>
}

/** Thin wrapper around an externally-initialized LogRocket client — logrocket is a peer, not a dependency. */
export function createLogRocketReporter(options: LogRocketReporterOptions): ErrorReporter {
  const { client, tags } = options
  return {
    report(error: CapturedError, context?: Record<string, unknown>) {
      // LogRocket requires tags/extra values to be scalar (string | number | boolean).
      client.captureException(error.error, {
        tags,
        extra: toScalarRecord({ ...corePayloadFields(error), ...context }),
      })
    },
  }
}

import type { CapturedError, ErrorReporter } from '../types'
import { corePayloadFields } from './_shared'

export interface HttpReporterOptions {
  endpoint: string
  /** Batch window in ms — errors reported within this window are sent as one request. Default: 0 (send immediately). */
  batchInterval?: number
  /** Flush early once the queue reaches this size, even if batchInterval hasn't elapsed. Default: 10. */
  maxBatchSize?: number
  headers?: Record<string, string>
  /** Transform an error + context into the value that gets serialized and sent. */
  serialize?: (error: CapturedError, context?: Record<string, unknown>) => unknown
}

function defaultSerialize(error: CapturedError, context?: Record<string, unknown>): unknown {
  return { ...corePayloadFields(error), context }
}

/**
 * POSTs batched errors to an HTTP endpoint. Normal flushes use fetch (supports headers);
 * a pagehide listener force-flushes any pending batch via navigator.sendBeacon, since an
 * in-flight fetch can be aborted by the browser when the page is actually closing.
 */
export function createHttpReporter(options: HttpReporterOptions): ErrorReporter {
  const {
    endpoint,
    batchInterval = 0,
    maxBatchSize = 10,
    headers,
    serialize = defaultSerialize,
  } = options
  let queue: unknown[] = []
  let timer: ReturnType<typeof setTimeout> | null = null

  function clearTimer(): void {
    if (timer !== null) {
      clearTimeout(timer)
      timer = null
    }
  }

  function send(payload: string, useBeacon: boolean): void {
    if (
      useBeacon &&
      typeof navigator !== 'undefined' &&
      typeof navigator.sendBeacon === 'function'
    ) {
      const sent = navigator.sendBeacon(endpoint, new Blob([payload], { type: 'application/json' }))
      if (sent) return
    }
    if (typeof fetch === 'function') {
      void fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: payload,
        keepalive: true,
      }).catch(() => {})
    }
  }

  function flush(useBeacon = false): void {
    clearTimer()
    if (queue.length === 0) return
    const payload = JSON.stringify(queue.length === 1 ? queue[0] : queue)
    queue = []
    send(payload, useBeacon)
  }

  if (typeof document !== 'undefined') {
    document.addEventListener('pagehide', () => flush(true))
  }

  return {
    report(error: CapturedError, context?: Record<string, unknown>) {
      queue.push(serialize(error, context))
      if (batchInterval <= 0 || queue.length >= maxBatchSize) {
        flush()
        return
      }
      if (timer === null) {
        timer = setTimeout(() => flush(), batchInterval)
      }
    },
  }
}

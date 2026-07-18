import { shallowRef, type ShallowRef } from 'vue'
import type { CapturedError, ErrorReporter } from './types'

export interface ErrorHistoryEntry extends CapturedError {
  /** Stable, monotonically increasing id — use it as the :key when rendering a list. */
  id: number
}

export interface ErrorHistoryOptions {
  /** Max entries kept, most recent first; oldest is evicted once the limit is exceeded. Default: 50. */
  limit?: number
}

export interface ErrorHistory {
  /** Most recent first. */
  entries: ShallowRef<ErrorHistoryEntry[]>
  /** An ErrorReporter — pass it alongside your real reporter(s) to record every captured error here. */
  record: ErrorReporter
  clear(): void
}

/**
 * A small in-memory error history, for a lightweight debug view of what an app's error
 * boundaries have caught — not a full Vue Devtools browser-extension integration (that would
 * need @vue/devtools-api as a dependency, which conflicts with this package's zero-dependency
 * core). Works by riding the existing reporter mechanism: `record` is just another
 * ErrorReporter, so no changes to <ErrorBoundary>/useErrorBoundary/useGlobalErrorCapture are
 * needed to plug it in.
 */
export function createErrorHistory(options: ErrorHistoryOptions = {}): ErrorHistory {
  const limit = options.limit ?? 50
  const entries = shallowRef<ErrorHistoryEntry[]>([])
  let nextId = 0

  return {
    entries,
    record: {
      report(error: CapturedError) {
        const entry: ErrorHistoryEntry = { ...error, id: nextId++ }
        entries.value = [entry, ...entries.value].slice(0, limit)
      },
    },
    clear() {
      entries.value = []
    },
  }
}

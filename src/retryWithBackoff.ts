import { ref, type Ref } from 'vue'

export interface RetryWithBackoffOptions {
  /** Delay before the first retry, in ms. Default: 1000. */
  baseDelayMs?: number
  /** Multiplier applied per attempt (`baseDelayMs * factor ** retryCount`). Default: 2
   * (exponential). Use `1` for a constant delay. */
  factor?: number
  /** Upper bound on the computed delay, in ms. Default: 30_000. */
  maxDelayMs?: number
}

export interface BackoffRetryControls {
  /**
   * Schedules a retry after a delay computed from the boundary's current `retryCount` (so each
   * successive attempt waits longer). A no-op while a retry is already pending, or if the ref
   * doesn't currently point at a mounted boundary.
   */
  retry(): void
  /** Cancels a pending scheduled retry, if any. Safe to call when nothing is pending. */
  cancel(): void
  /** Whether a retry is currently scheduled and waiting to fire. */
  isPending: Ref<boolean>
}

/**
 * Wraps a `<ErrorBoundary>`/`<AsyncBoundary>` template ref's `retry()` with an increasing delay —
 * for transient/network-ish failures where retrying instantly just fails again the same way.
 * Framework-agnostic beyond the `Ref` itself; doesn't require `useErrorBoundary()` or any
 * particular reporter/adapter.
 *
 * ```ts
 * const boundary = useTemplateRef('boundary')
 * const backoff = createBackoffRetry(boundary)
 * ```
 * ```vue
 * <ErrorBoundary ref="boundary">
 *   <template #fallback="{ error }">
 *     <button :disabled="backoff.isPending.value" @click="backoff.retry()">Retry</button>
 *   </template>
 * </ErrorBoundary>
 * ```
 */
export function createBackoffRetry(
  boundaryRef: Ref<{ retry: () => void; retryCount: number } | null | undefined>,
  options: RetryWithBackoffOptions = {},
): BackoffRetryControls {
  const { baseDelayMs = 1000, factor = 2, maxDelayMs = 30_000 } = options
  const isPending = ref(false)
  let timer: ReturnType<typeof setTimeout> | null = null

  function retry(): void {
    const boundary = boundaryRef.value
    if (!boundary || timer !== null) return

    const delay = Math.min(baseDelayMs * factor ** boundary.retryCount, maxDelayMs)
    isPending.value = true
    timer = setTimeout(() => {
      timer = null
      isPending.value = false
      boundaryRef.value?.retry()
    }, delay)
  }

  function cancel(): void {
    if (timer === null) return
    clearTimeout(timer)
    timer = null
    isPending.value = false
  }

  return { retry, cancel, isPending }
}

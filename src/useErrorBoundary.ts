import { computed, shallowRef, type ComputedRef, type ShallowRef } from 'vue'
import type { CaptureErrorInfo, CapturedError, UseErrorBoundaryOptions } from './types'
import { dispatchReport, normalizeError, safeInvoke, toArray } from './internal'

export interface UseErrorBoundaryReturn {
  error: ShallowRef<CapturedError | null>
  hasError: ComputedRef<boolean>
  reset: () => void
  captureError: (err: unknown, info?: CaptureErrorInfo) => CapturedError
}

/**
 * Programmatic error-boundary state, for use outside a template `<ErrorBoundary>` — e.g. to
 * manually register errors that `errorCaptured` never sees (rejected promises, DOM event
 * handlers, timers).
 */
export function useErrorBoundary(options: UseErrorBoundaryOptions = {}): UseErrorBoundaryReturn {
  // shallowRef: CapturedError is an immutable snapshot, and `.error` can hold an arbitrary
  // thrown value — deep-reactive-wrapping it via a plain ref would proxy that value for no
  // benefit and break reference-equality checks on it downstream.
  const error = shallowRef<CapturedError | null>(null)
  const hasError = computed(() => error.value !== null)

  function captureError(err: unknown, info: CaptureErrorInfo = {}): CapturedError {
    const captured = normalizeError(err, info)
    error.value = captured
    safeInvoke(() => options.onError?.(captured), options.internalErrorPrefix)
    dispatchReport(toArray(options.reporter), captured, {
      context: options.reportContext,
      internalErrorPrefix: options.internalErrorPrefix,
    })
    return captured
  }

  function reset(): void {
    safeInvoke(() => options.beforeReset?.(), options.internalErrorPrefix)
    error.value = null
  }

  return { error, hasError, reset, captureError }
}

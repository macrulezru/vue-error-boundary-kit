import { getCurrentScope, onScopeDispose } from 'vue'
import type { CaptureErrorInfo, CapturedError, ErrorReporter, ShouldCatchPredicate } from './types'
import { dispatchReport, normalizeError, safeInvoke, toArray } from './internal'

export interface UseGlobalErrorCaptureOptions {
  /** Called for every captured global error/rejection. */
  onError?: (error: CapturedError) => void
  /** Reporter(s) to invoke once per captured error. */
  reporter?: ErrorReporter | ErrorReporter[]
  /** Extra context merged into every report() call. */
  reportContext?: Record<string, unknown>
  /** Listen for uncaught errors via window.onerror. Default: true. */
  captureErrors?: boolean
  /** Listen for unhandled promise rejections. Default: true. */
  captureRejections?: boolean
  /**
   * Return false to ignore an error entirely — no onError, no report. Useful for browser/
   * extension noise (e.g. a benign "ResizeObserver loop" message). Default: catches everything.
   */
  shouldCatch?: ShouldCatchPredicate
  /**
   * Prefix for the internal safety-net log emitted when your own onError/reporter itself
   * throws. Default: '[vue-error-boundary-kit]'. Pass '' to omit it entirely.
   */
  internalErrorPrefix?: string
}

export interface UseGlobalErrorCaptureReturn {
  /** Removes the global listeners. Also runs automatically on scope dispose, if any. */
  stop: () => void
}

/**
 * Catches what onErrorCaptured/<ErrorBoundary> structurally cannot: errors thrown outside the
 * component render/setup lifecycle (raw addEventListener callbacks, setTimeout, unrelated
 * promise chains) and unhandled promise rejections. Not wired up automatically — importing this
 * entry point is the opt-in, so SSR bundles that never call it pay nothing for it.
 */
export function useGlobalErrorCapture(
  options: UseGlobalErrorCaptureOptions = {},
): UseGlobalErrorCaptureReturn {
  const { captureErrors = true, captureRejections = true } = options

  if (typeof window === 'undefined') {
    return { stop: () => {} }
  }

  function handle(err: unknown, info: CaptureErrorInfo): void {
    const captured = normalizeError(err, info)
    if (options.shouldCatch && !options.shouldCatch(captured)) return
    safeInvoke(() => options.onError?.(captured), options.internalErrorPrefix)
    dispatchReport(toArray(options.reporter), captured, {
      context: options.reportContext,
      internalErrorPrefix: options.internalErrorPrefix,
    })
  }

  function onError(event: ErrorEvent): void {
    handle(event.error ?? event.message, { source: 'event' })
  }

  function onRejection(event: PromiseRejectionEvent): void {
    handle(event.reason, { source: 'unhandledrejection' })
  }

  if (captureErrors) window.addEventListener('error', onError)
  if (captureRejections) window.addEventListener('unhandledrejection', onRejection)

  function stop(): void {
    if (captureErrors) window.removeEventListener('error', onError)
    if (captureRejections) window.removeEventListener('unhandledrejection', onRejection)
  }

  if (getCurrentScope()) {
    onScopeDispose(stop)
  }

  return { stop }
}

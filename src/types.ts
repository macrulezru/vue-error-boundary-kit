import type { InjectionKey } from 'vue'

export type CapturedErrorSource = 'render' | 'async' | 'event' | 'unhandledrejection' | 'manual'

export interface CapturedError {
  error: unknown
  message: string
  stack?: string
  componentName?: string
  lifecycleHook?: string
  source: CapturedErrorSource
  timestamp: number
}

export interface ErrorReporter {
  report(error: CapturedError, context?: Record<string, unknown>): void | Promise<void>
  /**
   * Optional teardown — reporters that register a persistent listener/timer
   * (e.g. `createHttpReporter`'s `pagehide` listener) implement this so a
   * consumer can actually remove it. A no-op reporter (most adapters) simply
   * omits it.
   */
  destroy?(): void
}

/** Return false to let an error pass through untouched — e.g. ignore a cancelled fetch's AbortError. */
export type ShouldCatchPredicate = (error: CapturedError) => boolean

export interface UseErrorBoundaryOptions {
  /** Called every time an error is captured, before/independent of any reporter wiring. */
  onError?: (error: CapturedError) => void
  /** Called right before the boundary state is reset. */
  beforeReset?: () => void
  /** Reporter(s) to invoke once per captured error. */
  reporter?: ErrorReporter | ErrorReporter[]
  /** Extra context merged into every report() call. */
  reportContext?: Record<string, unknown>
  /**
   * Prefix for the internal safety-net log emitted when your own onError/reporter/beforeReset
   * itself throws. Default: '[vue-error-boundary-kit]'. Pass '' to omit it entirely.
   */
  internalErrorPrefix?: string
}

export interface CaptureErrorInfo {
  componentName?: string
  lifecycleHook?: string
  source?: CapturedErrorSource
}

export interface ErrorBoundaryProps {
  /** Values that, when changed, auto-reset the boundary — mirrors react-error-boundary's resetKeys. */
  resetKeys?: unknown[]
  /** Reset on every parent re-render, regardless of resetKeys. Default: false. */
  resetOnPropsChange?: boolean
  /**
   * Called right before an automatic or manual reset. Deliberately not named `onReset`: this
   * component also emits a `reset` event, and Vue derives `onReset` as that event's own
   * listener prop — a same-named declared prop would collide with it (Vue's emit() looks up
   * `props.onReset` independently of whether it's a "real" prop, so it would fire twice, and
   * the second, emit-triggered call happens outside this package's own try/catch, defeating
   * the recursion guard entirely if it throws).
   */
  beforeReset?: () => void
  /** Stop the error from propagating to an ancestor <ErrorBoundary>. Default: true. */
  isolate?: boolean
  /** Max number of retries after which the fallback's retry control is disabled. */
  maxRetries?: number
  /** Reporter(s) to invoke once per captured error. */
  reporter?: ErrorReporter | ErrorReporter[]
  /**
   * Return false to let an error propagate past this boundary untouched — no state change, no
   * report, no fallback — exactly as if this boundary weren't there. Useful for noise like a
   * cancelled fetch's AbortError. Default: catches everything.
   */
  shouldCatch?: ShouldCatchPredicate
  /**
   * Prefix for the internal safety-net log emitted when your own onError/beforeReset/reporter
   * itself throws. Default: '[vue-error-boundary-kit]'. Pass '' to omit it entirely.
   */
  internalErrorPrefix?: string
}

export interface ErrorBoundaryEmits {
  (event: 'error', error: CapturedError): void
  (event: 'reset'): void
}

export interface ErrorBoundaryFallbackSlotProps {
  error: CapturedError
  reset: () => void
  retry: () => void
  retryCount: number
  canRetry: boolean
}

export type ErrorBoundaryBubbleFn = (error: CapturedError) => void

/** Provide/inject channel used to bubble a captured error to the nearest ancestor boundary when isolate is false. */
export const ERROR_BOUNDARY_BUBBLE_KEY: InjectionKey<ErrorBoundaryBubbleFn> = Symbol(
  'vue-error-boundary-kit:bubble',
)

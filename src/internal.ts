import type { CapturedError, CaptureErrorInfo, CapturedErrorSource, ErrorReporter } from './types'

/**
 * Vue's onErrorCaptured `info` argument is one of a fixed set of strings describing where the
 * error originated (see ErrorTypeStrings in @vue/runtime-core). We fold that into our own
 * source taxonomy. Vue reports both a synchronous setup() throw and an async setup() rejection
 * with the identical "setup function" info string, so that alone can't distinguish them —
 * `isAsyncSetup` (whether the component's own setup is an AsyncFunction) is what actually
 * separates "failed to initialize" (render) from "failed after an await" (async).
 */
const INFO_SOURCE_MAP: Record<string, CapturedErrorSource> = {
  'render function': 'render',
  'setup function': 'render',
  'native event handler': 'event',
  'component event handler': 'event',
}

export function mapCapturedInfoToSource(info: string, isAsyncSetup: boolean): CapturedErrorSource {
  if (info === 'setup function' && isAsyncSetup) return 'async'
  return INFO_SOURCE_MAP[info] ?? 'render'
}

const REPORTED = Symbol('vue-error-boundary-kit:reported')

type ReportedCapturedError = CapturedError & { [REPORTED]?: boolean }

export function normalizeError(err: unknown, info: CaptureErrorInfo = {}): CapturedError {
  const isError = err instanceof Error
  return {
    error: err,
    message: isError ? err.message : String(err),
    stack: isError ? err.stack : undefined,
    componentName: info.componentName,
    lifecycleHook: info.lifecycleHook,
    source: info.source ?? 'manual',
    timestamp: Date.now(),
  }
}

export function toArray<T>(value: T | T[] | undefined | null): T[] {
  if (!value) return []
  return Array.isArray(value) ? value : [value]
}

/**
 * Marks a CapturedError as reported. Returns true the first time it's called for a given
 * error instance, false on every subsequent call — used to guarantee a reporter fires exactly
 * once even when the same error bubbles through several nested boundaries (isolate: false).
 */
export function markReported(captured: CapturedError): boolean {
  const rec = captured as ReportedCapturedError
  if (rec[REPORTED]) return false
  rec[REPORTED] = true
  return true
}

const DEFAULT_INTERNAL_ERROR_PREFIX = '[vue-error-boundary-kit]'

function reportInternalFailure(err: unknown, prefix: string = DEFAULT_INTERNAL_ERROR_PREFIX): void {
  if (typeof console !== 'undefined') {
    const label = prefix ? `${prefix} ` : ''
    console.error(`${label}error handler/reporter threw:`, err)
  }
}

/** Runs a synchronous callback, swallowing (and logging) anything it throws. */
export function safeInvoke(fn: () => void, internalErrorPrefix?: string): void {
  try {
    fn()
  } catch (err) {
    reportInternalFailure(err, internalErrorPrefix)
  }
}

/** Runs a possibly-async callback, swallowing (and logging) sync throws and rejected promises. */
export function safeInvokeAsync(
  fn: () => void | Promise<void>,
  internalErrorPrefix?: string,
): void {
  try {
    const result = fn()
    if (result && typeof (result as Promise<void>).then === 'function') {
      ;(result as Promise<void>).catch((err) => reportInternalFailure(err, internalErrorPrefix))
    }
  } catch (err) {
    reportInternalFailure(err, internalErrorPrefix)
  }
}

export interface DispatchReportOptions {
  context?: Record<string, unknown>
  /** Prefix for the "a reporter threw" safety-net log, if one of the reporters throws. */
  internalErrorPrefix?: string
}

/**
 * Dispatches a captured error to every reporter exactly once for the lifetime of that error
 * instance, regardless of how many boundaries (or how many times) this is called for it.
 */
export function dispatchReport(
  reporters: ErrorReporter[],
  captured: CapturedError,
  options: DispatchReportOptions = {},
): void {
  if (reporters.length === 0) return
  if (!markReported(captured)) return
  for (const reporter of reporters) {
    safeInvokeAsync(() => reporter.report(captured, options.context), options.internalErrorPrefix)
  }
}

import type { CapturedError, ErrorReporter } from '../types'

export interface ConsoleReporterOptions {
  logger?: Pick<Console, 'error'>
  /** Prepended to every logged message. Default: '[vue-error-boundary-kit]'. Pass '' to omit it entirely. */
  prefix?: string
}

/** Default dev-mode reporter — logs to the console. No network calls, no dependencies. */
export function createConsoleReporter(options: ConsoleReporterOptions = {}): ErrorReporter {
  const logger = options.logger ?? console
  const prefix = options.prefix ?? '[vue-error-boundary-kit]'
  const label = prefix ? `${prefix} ` : ''
  return {
    report(error: CapturedError, context?: Record<string, unknown>) {
      logger.error(`${label}(${error.source}) ${error.message}`, {
        error,
        context,
      })
    },
  }
}

export const consoleReporter: ErrorReporter = createConsoleReporter()

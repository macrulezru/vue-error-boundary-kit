import type { CapturedError, CapturedErrorSource } from '../types'

/** The handful of CapturedError fields every destination adapter ends up forwarding somehow. */
export interface CorePayloadFields {
  message: string
  stack?: string
  componentName?: string
  lifecycleHook?: string
  source: CapturedErrorSource
  timestamp: number
}

export function corePayloadFields(error: CapturedError): CorePayloadFields {
  return {
    message: error.message,
    stack: error.stack,
    componentName: error.componentName,
    lifecycleHook: error.lifecycleHook,
    source: error.source,
    timestamp: error.timestamp,
  }
}

/** Coerces a context object down to the scalar-only shape some third-party SDKs require. */
export function toScalarRecord(
  input: Record<string, unknown> | undefined,
): Record<string, string | number | boolean> {
  const out: Record<string, string | number | boolean> = {}
  if (!input) return out
  for (const [key, value] of Object.entries(input)) {
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      out[key] = value
    } else if (value !== undefined && value !== null) {
      out[key] = JSON.stringify(value)
    }
  }
  return out
}

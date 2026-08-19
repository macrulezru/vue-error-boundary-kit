import { defineComponent, h } from 'vue'
import type { CapturedError, ErrorReporter } from './types'

/** Throws in `render()` when `shouldThrow` (default `true`) — the most common case: a component
 * that fails once mounted. Renders `<div class="ok">{{ message }}</div>` when `shouldThrow` is
 * `false`, so toggling the prop is enough to exercise both the failing and the recovered path. */
export const ThrowInRender = defineComponent({
  name: 'ThrowInRender',
  props: {
    message: { type: String, default: 'test error' },
    shouldThrow: { type: Boolean, default: true },
  },
  render() {
    if (this.shouldThrow) throw new Error(this.message)
    return h('div', { class: 'ok' }, this.message)
  },
})

/** Throws synchronously in `setup()` — for exercising the `source: 'render'` classification
 * (Vue reports a sync `setup()` throw with the same info string as a render-function throw). */
export const ThrowInSetup = defineComponent({
  name: 'ThrowInSetup',
  props: {
    message: { type: String, default: 'test error' },
  },
  setup(props) {
    throw new Error(props.message)
  },
  render() {
    return h('div', 'never')
  },
})

/** Throws from an `async setup()`, after an `await` — for exercising the `source: 'async'`
 * classification. Must be rendered inside a `<Suspense>` (or `<AsyncBoundary>`), same as any
 * other async component. */
export const ThrowInAsyncSetup = defineComponent({
  name: 'ThrowInAsyncSetup',
  props: {
    message: { type: String, default: 'test error' },
  },
  async setup(props) {
    await Promise.resolve()
    throw new Error(props.message)
  },
})

/** Throws a `DOMException` named `AbortError`, matching what a cancelled `fetch()` throws — for
 * exercising `shouldCatch` filters meant to ignore that specific noise. */
export const ThrowAbortError = defineComponent({
  name: 'ThrowAbortError',
  render() {
    throw new DOMException('The user aborted a request.', 'AbortError')
    return h('div') // unreachable — satisfies vue/require-render-return
  },
})

/** Builds a `CapturedError` fixture with sensible defaults — for unit-testing a reporter/adapter
 * without going through a real `<ErrorBoundary>`/`useErrorBoundary()` capture. */
export function makeCapturedError(overrides: Partial<CapturedError> = {}): CapturedError {
  const message = overrides.message ?? 'test error'
  return {
    ...overrides,
    error: overrides.error ?? new Error(message),
    message,
    source: overrides.source ?? 'manual',
    timestamp: overrides.timestamp ?? Date.now(),
  }
}

export interface RecordedReport {
  error: CapturedError
  context: Record<string, unknown> | undefined
}

export interface RecordingReporter extends ErrorReporter {
  /** Every `report()` call so far, in call order. */
  calls: RecordedReport[]
  /** Clears recorded calls. */
  reset(): void
}

/**
 * A framework-agnostic `ErrorReporter` test double — records calls to a plain array instead of
 * depending on a specific test runner's mocking API (`vi.fn()`, `jest.fn()`, ...), so it works
 * the same under Vitest, Jest, or anything else.
 */
export function createRecordingReporter(): RecordingReporter {
  const calls: RecordedReport[] = []
  return {
    calls,
    report(error: CapturedError, context?: Record<string, unknown>) {
      calls.push({ error, context })
    },
    reset() {
      calls.length = 0
    },
  }
}

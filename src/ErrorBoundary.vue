<script setup lang="ts">
import { computed, inject, onErrorCaptured, provide, ref, shallowRef, watch } from 'vue'
import type { CapturedError, ErrorBoundaryFallbackSlotProps, ErrorBoundaryProps } from './types'
import { ERROR_BOUNDARY_BUBBLE_KEY } from './types'
import {
  dispatchReport,
  mapCapturedInfoToSource,
  normalizeError,
  safeInvoke,
  toArray,
} from './internal'

defineOptions({ name: 'ErrorBoundary' })

const props = withDefaults(defineProps<ErrorBoundaryProps>(), {
  resetKeys: undefined,
  resetOnPropsChange: false,
  beforeReset: undefined,
  isolate: true,
  maxRetries: undefined,
  reporter: undefined,
  shouldCatch: undefined,
  internalErrorPrefix: undefined,
})

const emit = defineEmits<{
  error: [error: CapturedError]
  reset: []
}>()

defineSlots<{
  default(): unknown
  fallback(props: ErrorBoundaryFallbackSlotProps): unknown
}>()

const error = shallowRef<CapturedError | null>(null)
const retryCount = ref(0)
const hasError = computed(() => error.value !== null)
const canRetry = computed(
  () => props.maxRetries === undefined || retryCount.value < props.maxRetries,
)

const parentBubble = inject(ERROR_BOUNDARY_BUBBLE_KEY, null)

function applyCaptured(captured: CapturedError, { report }: { report: boolean }): void {
  error.value = captured
  emit('error', captured)
  if (report) {
    dispatchReport(toArray(props.reporter), captured, {
      internalErrorPrefix: props.internalErrorPrefix,
    })
  }
  if (!props.isolate) {
    parentBubble?.(captured)
  }
}

onErrorCaptured((err, instance, info) => {
  const type = instance?.$.type as
    { name?: string; __name?: string; setup?: (...args: unknown[]) => unknown } | undefined
  const isAsyncSetup = type?.setup?.constructor?.name === 'AsyncFunction'
  const captured = normalizeError(err, {
    componentName: type?.name ?? type?.__name,
    lifecycleHook: info,
    source: mapCapturedInfoToSource(info, isAsyncSetup),
  })
  if (props.shouldCatch && !props.shouldCatch(captured)) {
    // Not ours to handle — let Vue's own propagation continue to an ancestor boundary or the
    // app-level error handler, exactly as if this boundary weren't here.
    return true
  }
  applyCaptured(captured, { report: true })
  return false
})

// Errors bubbled up from a descendant boundary (isolate: false) were already reported there;
// dispatchReport's markReported guard makes re-dispatching here a no-op unless this is the
// first boundary in the chain to actually own a reporter for it.
provide(ERROR_BOUNDARY_BUBBLE_KEY, (captured: CapturedError) =>
  applyCaptured(captured, { report: true }),
)

function reset(): void {
  if (!hasError.value) return
  safeInvoke(() => props.beforeReset?.(), props.internalErrorPrefix)
  error.value = null
  retryCount.value = 0
  emit('reset')
}

function retry(): void {
  if (!hasError.value || !canRetry.value) return
  safeInvoke(() => props.beforeReset?.(), props.internalErrorPrefix)
  retryCount.value += 1
  error.value = null
  emit('reset')
}

watch(
  () => (props.resetKeys ? [...props.resetKeys] : null),
  (next, prev) => {
    if (!hasError.value || !next) return
    if (
      !prev ||
      next.length !== prev.length ||
      next.some((value, index) => !Object.is(value, prev[index]))
    ) {
      reset()
    }
  },
)

watch(
  () => (props.resetOnPropsChange ? { ...props } : null),
  (_next, prev) => {
    if (!props.resetOnPropsChange || !hasError.value || prev === null) return
    reset()
  },
)

// Lets code outside the fallback slot — e.g. a retry control that lives elsewhere in the UI,
// or a parent deciding to recover a boundary it doesn't directly render the fallback for —
// drive the boundary imperatively via a template ref.
defineExpose({
  error,
  hasError,
  retryCount,
  canRetry,
  reset,
  retry,
})
</script>

<template>
  <slot v-if="!hasError" />
  <slot
    v-else
    name="fallback"
    :error="error!"
    :reset="reset"
    :retry="retry"
    :retry-count="retryCount"
    :can-retry="canRetry"
  />
</template>

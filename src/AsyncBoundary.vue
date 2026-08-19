<script setup lang="ts">
import { computed, useTemplateRef } from 'vue'
import ErrorBoundary from './ErrorBoundary.vue'
import type { CapturedError, ErrorBoundaryFallbackSlotProps, ErrorBoundaryProps } from './types'

defineOptions({ name: 'AsyncBoundary' })

const props = defineProps<ErrorBoundaryProps>()

const emit = defineEmits<{
  error: [error: CapturedError]
  reset: []
}>()

defineSlots<{
  default(): unknown
  /** Shown while the default slot's async dependencies (async setup, async components) are pending. */
  loading(): unknown
  fallback(props: ErrorBoundaryFallbackSlotProps): unknown
}>()

const boundary = useTemplateRef('boundary')

// Composition, not reimplementation — this is <ErrorBoundary> wrapping a <Suspense>, forwarding
// props/events/exposed API straight through. All error-capture/retry/reset logic lives in one
// place (ErrorBoundary.vue); this component only adds the Suspense loading slot on top.
defineExpose({
  error: computed<CapturedError | null>(() => boundary.value?.error ?? null),
  hasError: computed(() => boundary.value?.hasError ?? false),
  retryCount: computed(() => boundary.value?.retryCount ?? 0),
  canRetry: computed(() => boundary.value?.canRetry ?? true),
  reset: () => boundary.value?.reset(),
  retry: () => boundary.value?.retry(),
})
</script>

<template>
  <ErrorBoundary
    ref="boundary"
    v-bind="props"
    @error="emit('error', $event)"
    @reset="emit('reset')"
  >
    <template #default>
      <Suspense>
        <template #default><slot /></template>
        <template #fallback><slot name="loading" /></template>
      </Suspense>
    </template>
    <template #fallback="fallbackProps">
      <slot name="fallback" v-bind="fallbackProps" />
    </template>
  </ErrorBoundary>
</template>

import { useNuxtApp } from 'nuxt/app'
import { mapCapturedInfoToSource } from '../internal'
import { useErrorBoundary } from '../useErrorBoundary'
import type { UseErrorBoundaryReturn } from '../useErrorBoundary'
import type { UseErrorBoundaryOptions } from '../types'

/**
 * `useErrorBoundary()`, wired to also catch what escapes every `<ErrorBoundary>` in the tree —
 * Nuxt's own `vue:error` (a Vue render/setup error that reached the app root uncaught) and
 * `app:error` (Nuxt's `showError()`/`createError()` fatal-error flow, which never goes through
 * Vue's `onErrorCaptured` at all). Both hooks run isomorphically, so this covers SSR and client
 * alike. Typically called once, e.g. in `app.vue`'s `<script setup>`.
 */
export function useNuxtErrorBoundary(
  options: UseErrorBoundaryOptions = {},
): UseErrorBoundaryReturn {
  const boundary = useErrorBoundary(options)
  const nuxtApp = useNuxtApp()

  nuxtApp.hook('vue:error', (err, instance, info) => {
    const type = instance?.$.type as
      { name?: string; __name?: string; setup?: (...args: unknown[]) => unknown } | undefined
    const isAsyncSetup = type?.setup?.constructor?.name === 'AsyncFunction'
    boundary.captureError(err, {
      componentName: type?.name ?? type?.__name,
      lifecycleHook: info,
      source: mapCapturedInfoToSource(info, isAsyncSetup),
    })
  })

  nuxtApp.hook('app:error', (err) => {
    boundary.captureError(err, { source: 'manual' })
  })

  return boundary
}

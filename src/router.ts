import { getCurrentScope, onScopeDispose } from 'vue'
import { useRouter } from 'vue-router'
import { useErrorBoundary } from './useErrorBoundary'
import type { UseErrorBoundaryReturn } from './useErrorBoundary'
import type { UseErrorBoundaryOptions } from './types'

/**
 * `useErrorBoundary()`, wired to `vue-router`'s own `router.onError()` — which catches errors
 * `onErrorCaptured` structurally cannot: ones thrown in navigation guards, passed to `next()`,
 * or raised while resolving an async route component (`component: () => import(...)`), none of
 * which happen inside a component's render/setup lifecycle. Unsubscribes automatically on scope
 * dispose, the same as `useGlobalErrorCapture()`.
 */
export function useRouterErrorBoundary(
  options: UseErrorBoundaryOptions = {},
): UseErrorBoundaryReturn {
  const boundary = useErrorBoundary(options)
  const router = useRouter()

  const unsubscribe = router.onError((error) => {
    boundary.captureError(error, { source: 'manual' })
  })

  if (getCurrentScope()) {
    onScopeDispose(unsubscribe)
  }

  return boundary
}

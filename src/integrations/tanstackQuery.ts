import { useQueryClient, type QueryClient } from '@tanstack/vue-query'
import { safeInvokeAsync } from '../internal'

export interface UseQueryErrorResetOptions {
  /** The QueryClient to reset queries on. Default: `useQueryClient(id)`. */
  queryClient?: QueryClient
  /** Forwarded to `useQueryClient()` when `queryClient` isn't given — for multi-client setups. */
  id?: string
  /**
   * Prefix for the internal safety-net log emitted if `resetQueries()` itself rejects.
   * Default: '[vue-error-boundary-kit]'. Pass '' to omit it entirely.
   */
  internalErrorPrefix?: string
}

/**
 * `<ErrorBoundary>`'s own `retry()`/`reset()` only re-renders the tree — a `useQuery()` that
 * already failed stays in its cached error state and re-throws immediately on the very next
 * render if `throwOnError` is set, defeating retry. This returns a sync callback that resets
 * every currently-errored query, meant to be wired into `beforeReset` so it runs right before
 * that re-render:
 *
 * ```vue
 * <ErrorBoundary :before-reset="useQueryErrorReset()">…</ErrorBoundary>
 * ```
 *
 * Mirrors what `@tanstack/react-query`'s `QueryErrorResetBoundary` achieves via a context-based
 * "reset" gate — `@tanstack/vue-query` has no equivalent primitive, so this reaches directly for
 * `queryClient.resetQueries()`, scoped to queries whose `state.status === 'error'`.
 */
export function useQueryErrorReset(options: UseQueryErrorResetOptions = {}): () => void {
  const queryClient = options.queryClient ?? useQueryClient(options.id)

  return function resetErroredQueries(): void {
    safeInvokeAsync(
      () => queryClient.resetQueries({ predicate: (query) => query.state.status === 'error' }),
      options.internalErrorPrefix,
    )
  }
}

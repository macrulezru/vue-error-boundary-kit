import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createSSRApp, h } from 'vue'
import { renderToString } from '@vue/server-renderer'
import ErrorBoundary from '../ErrorBoundary.vue'
import type { CapturedError } from '../types'
import { Boom } from './helpers'

function buildTree(shouldThrow: boolean) {
  return {
    render() {
      return h('div', { id: 'app' }, [
        h(
          ErrorBoundary,
          {},
          {
            default: () => h(Boom, { shouldThrow, message: 'hydration boom' }),
            fallback: ({ error }: { error: CapturedError }) =>
              h('div', { class: 'fallback' }, error.message),
          },
        ),
      ])
    },
  }
}

/**
 * Vue's SSR renderer has no reactive "second pass": a synchronous error caught by
 * onErrorCaptured during renderToString cannot retroactively change what's already been
 * emitted for that position, so the server output for a failed subtree is an empty
 * placeholder rather than the fallback slot's markup. This is a structural limitation of
 * Vue 3's SSR architecture (confirmed empirically — see PR discussion / README SSR section),
 * not something fixable from userland without internal renderer APIs or double-executing the
 * subtree's setup(), both of which the spec explicitly rules out. What IS guaranteed and
 * tested here: no exception, no page crash, correct reporting, and a client that always ends
 * up in the correct, interactive state after hydration — even when server/client disagree.
 */
describe('ErrorBoundary — case 8: hydration after an SSR fallback', () => {
  let container: HTMLDivElement
  let warnSpy: ReturnType<typeof vi.spyOn>
  let errorSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    container.remove()
    warnSpy.mockRestore()
    errorSpy.mockRestore()
  })

  it('hydrates without warnings when server and client agree the child fails', async () => {
    const serverHtml = await renderToString(createSSRApp(buildTree(true)))
    container.innerHTML = serverHtml

    const clientApp = createSSRApp(buildTree(true))
    clientApp.mount(container)
    await new Promise((r) => setTimeout(r, 0))

    expect(container.querySelector('.fallback')?.textContent).toBe('hydration boom')

    const hydrationWarnings = [...warnSpy.mock.calls, ...errorSpy.mock.calls].filter((args) =>
      String(args[0]).toLowerCase().includes('hydration'),
    )
    expect(hydrationWarnings).toEqual([])
  })

  it('self-heals to correct, interactive content when server and client state disagree', async () => {
    // Server hit the error; by the time the client hydrates, the underlying condition is fixed
    // (e.g. the failing fetch that only broke on the server has since succeeded). Vue's own
    // hydration-mismatch recovery may log a warning here (dev-only, stripped in production
    // builds) — what must hold regardless is that the client ends up correct and interactive,
    // never stuck on the server's stale fallback and never crashed.
    const serverHtml = await renderToString(createSSRApp(buildTree(true)))
    container.innerHTML = serverHtml

    const clientApp = createSSRApp(buildTree(false))
    expect(() => clientApp.mount(container)).not.toThrow()
    await new Promise((r) => setTimeout(r, 0))

    expect(container.querySelector('.boom-ok')).not.toBeNull()
    expect(container.querySelector('.fallback')).toBeNull()
  })
})

import { describe, expect, it, vi } from 'vitest'
import { createSSRApp, h } from 'vue'
import { renderToString } from '@vue/server-renderer'
import ErrorBoundary from '../ErrorBoundary.vue'
import type { CapturedError } from '../types'
import { Boom, Working } from './helpers'

/**
 * Vue's SSR renderer has no reactive "second pass" (see hydration.test.ts for the full
 * explanation), so a failed subtree comes out as an empty placeholder in the server HTML
 * rather than the fallback slot's markup. What's guaranteed and tested here — and what
 * actually matters for "not a 500 page" — is that renderToString never throws, sibling
 * content still renders, and reporting/events fire exactly like on the client.
 */
describe('ErrorBoundary — case 7: SSR render with a failing child', () => {
  it('renderToString resolves without throwing and the rest of the page still renders', async () => {
    const app = createSSRApp({
      render() {
        return h('div', { id: 'app' }, [
          h(Working, { label: 'before' }),
          h(
            ErrorBoundary,
            {},
            {
              default: () => h(Boom, { message: 'ssr boom' }),
              fallback: ({ error }: { error: CapturedError }) =>
                h('div', { class: 'fallback' }, error.message),
            },
          ),
          h(Working, { label: 'after' }),
        ])
      },
    })

    let html = ''
    await expect((async () => (html = await renderToString(app)))()).resolves.not.toThrow()

    expect(html).toContain('before')
    expect(html).toContain('after')
  })

  it('fires the error event and reporter during SSR, exactly like on the client', async () => {
    const events: CapturedError[] = []
    const reporter = { report: vi.fn() }

    const app = createSSRApp({
      render() {
        return h(
          ErrorBoundary,
          { reporter, onError: (e: CapturedError) => events.push(e) },
          {
            default: () => h(Boom, { message: 'ssr reported boom' }),
            fallback: () => h('div', 'fallback'),
          },
        )
      },
    })

    await renderToString(app)

    expect(events).toHaveLength(1)
    expect(events[0]?.message).toBe('ssr reported boom')
    expect(reporter.report).toHaveBeenCalledTimes(1)
  })

  it('a boundary with no failing children renders default content normally during SSR', async () => {
    const app = createSSRApp({
      render() {
        return h(
          ErrorBoundary,
          {},
          {
            default: () => h(Working, { label: 'ssr-ok' }),
            fallback: () => h('div', 'fallback'),
          },
        )
      },
    })

    const html = await renderToString(app)
    expect(html).toContain('ssr-ok')
    expect(html).not.toContain('fallback')
  })
})

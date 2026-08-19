import { describe, expect, it, vi } from 'vitest'
import { h, nextTick } from 'vue'
import { mount } from '@vue/test-utils'
import ErrorBoundary from '../ErrorBoundary.vue'
import type { ErrorReporter } from '../types'
import { Boom } from './helpers'

function makeReporter(): ErrorReporter & {
  report: ReturnType<typeof vi.fn<ErrorReporter['report']>>
} {
  return { report: vi.fn<ErrorReporter['report']>() }
}

describe('ErrorBoundary — case 10: reporter dedup across nested boundaries', () => {
  it('calls the outer reporter exactly once when the inner boundary has none (isolate: false)', async () => {
    const outerReporter = makeReporter()

    mount(ErrorBoundary, {
      props: { reporter: outerReporter },
      slots: {
        default: () =>
          h(
            ErrorBoundary,
            { isolate: false },
            { default: () => h(Boom, { message: 'dedup boom' }) },
          ),
        fallback: () => h('div'),
      },
    })
    await nextTick()

    expect(outerReporter.report).toHaveBeenCalledTimes(1)
  })

  it('does not call the outer reporter a second time when the inner boundary already reported it', async () => {
    const innerReporter = makeReporter()
    const outerReporter = makeReporter()

    mount(ErrorBoundary, {
      props: { reporter: outerReporter },
      slots: {
        default: () =>
          h(
            ErrorBoundary,
            { isolate: false, reporter: innerReporter },
            { default: () => h(Boom, { message: 'dedup boom 2' }) },
          ),
        fallback: () => h('div'),
      },
    })
    await nextTick()

    expect(innerReporter.report).toHaveBeenCalledTimes(1)
    expect(outerReporter.report).not.toHaveBeenCalled()
  })

  it('a boundary with isolate: true never reports to an ancestor reporter', async () => {
    const outerReporter = makeReporter()

    mount(ErrorBoundary, {
      props: { reporter: outerReporter },
      slots: {
        default: () => h(ErrorBoundary, {}, { default: () => h(Boom, { message: 'local only' }) }),
        fallback: () => h('div'),
      },
    })
    await nextTick()

    expect(outerReporter.report).not.toHaveBeenCalled()
  })
})

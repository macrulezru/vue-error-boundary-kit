import { describe, expect, it, vi } from 'vitest'
import { Suspense, defineComponent, h } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'
import ErrorBoundary from '../ErrorBoundary.vue'
import type { CapturedError } from '../types'

const AsyncBoom = defineComponent({
  name: 'AsyncBoom',
  async setup() {
    await Promise.resolve()
    throw new Error('async setup boom')
  },
  render() {
    return h('div', 'never')
  },
})

describe('ErrorBoundary — case 2: async setup() error', () => {
  it('shows the fallback with source "async"', async () => {
    const onError = vi.fn<(error: CapturedError) => void>()
    const wrapper = mount(ErrorBoundary, {
      props: { onError },
      slots: {
        default: () =>
          h(Suspense, null, {
            default: () => h(AsyncBoom),
            fallback: () => h('div', 'loading'),
          }),
        fallback: ({ error }: { error: CapturedError }) =>
          h('div', { class: 'fallback' }, error.message),
      },
    })

    await flushPromises()

    expect(wrapper.find('.fallback').exists()).toBe(true)
    expect(onError).toHaveBeenCalledTimes(1)
    const captured = onError.mock.calls[0]?.[0]
    expect(captured?.source).toBe('async')
    expect(captured?.message).toBe('async setup boom')
  })
})

import { describe, expect, it, vi } from 'vitest'
import { defineComponent, h } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'
import AsyncBoundary from '../AsyncBoundary.vue'
import type { CapturedError } from '../types'

describe('AsyncBoundary', () => {
  it('shows the loading slot while pending, then the fallback slot on error', async () => {
    const AsyncThing = defineComponent({
      name: 'AsyncThing',
      async setup() {
        await Promise.resolve()
        throw new Error('async boom')
      },
      render: () => h('div', 'never'),
    })

    const wrapper = mount(AsyncBoundary, {
      slots: {
        default: () => h(AsyncThing),
        loading: () => h('div', { class: 'loading' }, 'loading'),
        fallback: ({ error }: { error: CapturedError }) =>
          h('div', { class: 'fallback' }, error.message),
      },
    })

    expect(wrapper.find('.loading').exists()).toBe(true)
    expect(wrapper.find('.fallback').exists()).toBe(false)

    await flushPromises()

    expect(wrapper.find('.loading').exists()).toBe(false)
    expect(wrapper.find('.fallback').text()).toBe('async boom')
  })

  it('retry() remounts the default slot, re-running async setup — a second attempt can succeed', async () => {
    let attempt = 0
    const AsyncThing = defineComponent({
      name: 'AsyncThing',
      async setup() {
        attempt++
        await Promise.resolve()
        if (attempt === 1) throw new Error('async boom')
        return () => h('div', { class: 'ok' }, 'loaded')
      },
    })

    const wrapper = mount(AsyncBoundary, {
      slots: {
        default: () => h(AsyncThing),
        loading: () => h('div', 'loading'),
        fallback: ({ retry }: { retry: () => void }) =>
          h('button', { class: 'retry', onClick: retry }, 'retry'),
      },
    })

    await flushPromises()
    expect(wrapper.find('.retry').exists()).toBe(true)
    expect(attempt).toBe(1)

    await wrapper.find('.retry').trigger('click')
    await flushPromises()

    expect(attempt).toBe(2)
    expect(wrapper.find('.ok').text()).toBe('loaded')
  })

  it('forwards error/reset events and delegates the exposed reset()/retry()/error API to the inner ErrorBoundary', async () => {
    let attempt = 0
    const Boom = defineComponent({
      name: 'Boom',
      async setup() {
        attempt++
        await Promise.resolve()
        if (attempt === 1) throw new Error('boom')
        return () => h('div', 'ok')
      },
    })

    const onError = vi.fn<(error: CapturedError) => void>()
    const onReset = vi.fn()

    const wrapper = mount(AsyncBoundary, {
      props: { onError, onReset },
      slots: {
        default: () => h(Boom),
        fallback: () => h('div', 'fallback'),
      },
    })

    await flushPromises()

    expect(onError).toHaveBeenCalledTimes(1)
    expect(wrapper.vm.hasError).toBe(true)
    expect(wrapper.vm.error?.message).toBe('boom')

    wrapper.vm.reset()
    await flushPromises()

    expect(onReset).toHaveBeenCalledTimes(1)
    expect(wrapper.vm.hasError).toBe(false)
  })

  it('exposes retryCount/canRetry and a working retry() called directly (not via the fallback slot)', async () => {
    let attempt = 0
    const Boom = defineComponent({
      name: 'Boom',
      async setup() {
        attempt++
        await Promise.resolve()
        if (attempt === 1) throw new Error('boom')
        return () => h('div', 'ok')
      },
    })

    const wrapper = mount(AsyncBoundary, {
      props: { maxRetries: 1 },
      slots: { default: () => h(Boom), fallback: () => h('div', 'fallback') },
    })

    await flushPromises()
    expect(wrapper.vm.retryCount).toBe(0)
    expect(wrapper.vm.canRetry).toBe(true)

    wrapper.vm.retry()
    await flushPromises()

    expect(attempt).toBe(2)
    expect(wrapper.vm.hasError).toBe(false)
    expect(wrapper.vm.retryCount).toBe(1)
    expect(wrapper.vm.canRetry).toBe(false)
  })
})

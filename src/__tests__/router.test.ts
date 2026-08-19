import { describe, expect, it, vi } from 'vitest'
import { defineComponent, h } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'
import { createMemoryHistory, createRouter, type RouteRecordRaw } from 'vue-router'
import { useRouterErrorBoundary } from '../router'

function makeRouter(routes: RouteRecordRaw[]) {
  return createRouter({ history: createMemoryHistory(), routes })
}

function mountHarness(router: ReturnType<typeof makeRouter>) {
  const Harness = defineComponent({
    name: 'Harness',
    setup() {
      return { boundary: useRouterErrorBoundary() }
    },
    render() {
      return h('div', this.boundary.hasError.value ? 'error' : 'ok')
    },
  })
  return mount(Harness, { global: { plugins: [router] } })
}

describe('useRouterErrorBoundary', () => {
  it('captures an error thrown synchronously in a navigation guard', async () => {
    const router = makeRouter([
      { path: '/', component: { render: () => h('div', 'home') } },
      {
        path: '/broken',
        component: { render: () => h('div', 'broken') },
        beforeEnter: () => {
          throw new Error('guard boom')
        },
      },
    ])

    const wrapper = mountHarness(router)
    await router.isReady()

    await router.push('/broken').catch(() => {})
    await flushPromises()

    expect(wrapper.vm.boundary.hasError.value).toBe(true)
    expect(wrapper.vm.boundary.error.value?.message).toBe('guard boom')
  })

  it('captures an error from a failed async route component load', async () => {
    const router = makeRouter([
      { path: '/', component: { render: () => h('div', 'home') } },
      { path: '/lazy', component: () => Promise.reject(new Error('chunk load failed')) },
    ])

    const wrapper = mountHarness(router)
    await router.isReady()

    await router.push('/lazy').catch(() => {})
    await flushPromises()

    expect(wrapper.vm.boundary.hasError.value).toBe(true)
    expect(wrapper.vm.boundary.error.value?.message).toBe('chunk load failed')
  })

  it('forwards reporter/onError options to the underlying useErrorBoundary()', async () => {
    const router = makeRouter([
      {
        path: '/',
        component: { render: () => h('div', 'home') },
        beforeEnter: () => {
          throw new Error('guard boom')
        },
      },
    ])
    const onError = vi.fn()

    const Harness = defineComponent({
      setup() {
        useRouterErrorBoundary({ onError })
        return {}
      },
      render: () => h('div'),
    })
    mount(Harness, { global: { plugins: [router] } })
    await router.isReady().catch(() => {})
    await flushPromises()

    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ message: 'guard boom' }))
  })

  it('unsubscribes from router.onError when the owning scope is disposed', async () => {
    const router = makeRouter([{ path: '/', component: { render: () => h('div', 'home') } }])
    const unsubscribe = vi.fn()
    const onErrorSpy = vi.spyOn(router, 'onError').mockReturnValue(unsubscribe)

    const wrapper = mountHarness(router)
    await router.isReady()
    expect(onErrorSpy).toHaveBeenCalledTimes(1)
    expect(unsubscribe).not.toHaveBeenCalled()

    wrapper.unmount()

    expect(unsubscribe).toHaveBeenCalledTimes(1)
  })
})

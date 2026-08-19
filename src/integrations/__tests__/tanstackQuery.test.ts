import { describe, expect, it } from 'vitest'
import { defineComponent, h } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'
import { QueryClient, VueQueryPlugin, useQuery } from '@tanstack/vue-query'
import ErrorBoundary from '../../ErrorBoundary.vue'
import { useQueryErrorReset } from '../tanstackQuery'

describe('useQueryErrorReset', () => {
  it('lets a retried query actually refetch instead of instantly re-throwing the cached error', async () => {
    let calls = 0
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })

    const Query = defineComponent({
      name: 'Query',
      setup() {
        const { data } = useQuery({
          queryKey: ['thing'],
          queryFn: () => {
            calls++
            return calls === 1 ? Promise.reject(new Error('boom')) : Promise.resolve('ok')
          },
          throwOnError: true,
        })
        return () => h('div', { class: 'ok' }, data.value)
      },
    })

    const Harness = defineComponent({
      name: 'Harness',
      setup() {
        return { resetErroredQueries: useQueryErrorReset({ queryClient }) }
      },
      render() {
        return h(
          ErrorBoundary,
          { beforeReset: this.resetErroredQueries },
          {
            default: () => h(Query),
            fallback: ({ retry }: { retry: () => void }) =>
              h('button', { class: 'retry', onClick: retry }, 'retry'),
          },
        )
      },
    })

    const wrapper = mount(Harness, { global: { plugins: [[VueQueryPlugin, { queryClient }]] } })
    await flushPromises()

    expect(wrapper.find('.retry').exists()).toBe(true)
    expect(calls).toBe(1)

    await wrapper.find('.retry').trigger('click')
    await flushPromises()

    expect(calls).toBe(2)
    expect(wrapper.find('.ok').text()).toBe('ok')
  })

  it('does not touch queries that are not currently in an error state', async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    await queryClient.fetchQuery({
      queryKey: ['fine'],
      queryFn: () => Promise.resolve('untouched'),
    })

    const resetErroredQueries = useQueryErrorReset({ queryClient })
    resetErroredQueries()
    await flushPromises()

    expect(queryClient.getQueryData(['fine'])).toBe('untouched')
  })
})

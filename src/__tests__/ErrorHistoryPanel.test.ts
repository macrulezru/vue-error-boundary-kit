import { describe, expect, it } from 'vitest'
import { nextTick } from 'vue'
import { mount } from '@vue/test-utils'
import ErrorHistoryPanel from '../ErrorHistoryPanel.vue'
import { createErrorHistory } from '../errorHistory'
import type { CapturedError } from '../types'

function makeError(message: string): CapturedError {
  return {
    error: new Error(message),
    message,
    source: 'render',
    timestamp: Date.parse('2026-01-01T00:00:00Z'),
  }
}

describe('ErrorHistoryPanel', () => {
  it('shows an empty state with no entries', () => {
    const history = createErrorHistory()
    const wrapper = mount(ErrorHistoryPanel, { props: { history } })
    expect(wrapper.text()).toContain('No errors captured yet.')
    expect(wrapper.text()).toContain('Error history (0)')
  })

  it('renders entries reactively as they are recorded', async () => {
    const history = createErrorHistory()
    const wrapper = mount(ErrorHistoryPanel, { props: { history } })

    history.record.report(makeError('first boom'))
    await nextTick()

    expect(wrapper.text()).toContain('Error history (1)')
    expect(wrapper.text()).toContain('first boom')
    expect(wrapper.text()).not.toContain('No errors captured yet.')
  })

  it('the clear button empties the history', async () => {
    const history = createErrorHistory()
    history.record.report(makeError('boom'))
    const wrapper = mount(ErrorHistoryPanel, { props: { history } })
    await nextTick()
    expect(wrapper.text()).toContain('boom')

    await wrapper.get('button').trigger('click')

    expect(history.entries.value).toHaveLength(0)
    expect(wrapper.text()).toContain('No errors captured yet.')
  })

  it('shows the component name when present', async () => {
    const history = createErrorHistory()
    history.record.report({ ...makeError('boom'), componentName: 'UserProfile' })
    const wrapper = mount(ErrorHistoryPanel, { props: { history } })
    await nextTick()
    expect(wrapper.text()).toContain('UserProfile')
  })
})

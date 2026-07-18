import { defineComponent, h, type PropType } from 'vue'

export const Boom = defineComponent({
  name: 'Boom',
  props: {
    message: { type: String, default: 'boom' },
    shouldThrow: { type: Boolean, default: true },
  },
  render() {
    if (this.shouldThrow) throw new Error(this.message)
    return h('div', { class: 'boom-ok' }, 'ok')
  },
})

export const SyncSetupBoom = defineComponent({
  name: 'SyncSetupBoom',
  props: {
    message: { type: String, default: 'sync setup boom' },
  },
  setup(props) {
    throw new Error(props.message)
  },
  render() {
    return h('div', 'never')
  },
})

export const AbortBoom = defineComponent({
  name: 'AbortBoom',
  render() {
    throw new DOMException('The user aborted a request.', 'AbortError')
    return h('div') // unreachable — satisfies vue/require-render-return
  },
})

export const Working = defineComponent({
  name: 'Working',
  props: {
    label: { type: String as PropType<string>, default: 'working' },
  },
  render() {
    return h('div', { class: 'working' }, this.label)
  },
})

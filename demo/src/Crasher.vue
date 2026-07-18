<script setup lang="ts">
const props = withDefaults(defineProps<{ crash?: boolean; label?: string }>(), {
  crash: false,
  label: 'component',
})

if (props.crash) {
  throw new Error(`Crasher: simulated failure in "${props.label}"`)
}
</script>

<template>
  <div class="crasher-ok">✅ {{ label }} rendered fine</div>
</template>

<script setup lang="ts">
const props = withDefaults(defineProps<{ crash?: boolean; label?: string }>(), {
  crash: false,
  label: 'async component',
})

await new Promise((resolve) => setTimeout(resolve, 400))

if (props.crash) {
  throw new Error(`AsyncCrasher: simulated failure in "${props.label}" after await`)
}
</script>

<template>
  <div class="crasher-ok">✅ {{ label }} resolved fine</div>
</template>

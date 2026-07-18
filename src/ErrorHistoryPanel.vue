<script setup lang="ts">
import type { ErrorHistory } from './errorHistory'

defineProps<{ history: ErrorHistory }>()

defineOptions({ name: 'ErrorHistoryPanel' })

// Inline styles, not <style scoped>: Vite would extract scoped CSS into a separate stylesheet
// that consumers must remember to import (see vue-toast-kit's /style.css). For a small debug
// panel, "import the component and it just works" beats saving a few bytes of inline style attrs.
const panelStyle = {
  font: '12px/1.5 ui-monospace, SFMono-Regular, Menlo, monospace',
  border: '1px solid color-mix(in srgb, currentColor 20%, transparent)',
  borderRadius: '8px',
  padding: '8px 10px',
  maxHeight: '260px',
  overflowY: 'auto' as const,
}
const headerStyle = {
  display: 'flex',
  alignItems: 'baseline',
  justifyContent: 'space-between',
  gap: '8px',
  marginBottom: '6px',
}
const clearButtonStyle = {
  font: 'inherit',
  cursor: 'pointer',
  border: '1px solid color-mix(in srgb, currentColor 25%, transparent)',
  borderRadius: '4px',
  background: 'transparent',
  color: 'inherit',
  padding: '1px 8px',
}
const emptyStyle = { opacity: 0.6, margin: 0 }
const listStyle = {
  listStyle: 'none',
  margin: 0,
  padding: 0,
  display: 'flex',
  flexDirection: 'column' as const,
  gap: '3px',
}
const itemStyle = {
  display: 'flex',
  gap: '6px',
  alignItems: 'baseline',
  whiteSpace: 'nowrap' as const,
  overflow: 'hidden',
}
const mutedStyle = { opacity: 0.6, flexShrink: 0 }
const componentStyle = { opacity: 0.8, flexShrink: 0 }
const messageStyle = { overflow: 'hidden', textOverflow: 'ellipsis' as const }

function formatTime(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString()
}
</script>

<template>
  <div :style="panelStyle" class="veb-history-panel">
    <div :style="headerStyle">
      <strong>Error history ({{ history.entries.value.length }})</strong>
      <button type="button" :style="clearButtonStyle" @click="history.clear()">Clear</button>
    </div>
    <p v-if="history.entries.value.length === 0" :style="emptyStyle">No errors captured yet.</p>
    <ul v-else :style="listStyle">
      <li v-for="entry in history.entries.value" :key="entry.id" :style="itemStyle">
        <span :style="mutedStyle">{{ formatTime(entry.timestamp) }}</span>
        <span :style="mutedStyle">{{ entry.source }}</span>
        <span v-if="entry.componentName" :style="componentStyle">{{ entry.componentName }}</span>
        <span :style="messageStyle">{{ entry.message }}</span>
      </li>
    </ul>
  </div>
</template>

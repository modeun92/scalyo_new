<template>
  <Teleport to="body">
    <TransitionGroup name="toast" tag="div" class="toast_container">
      <div v-for="t in toasts" :key="t.id" :class="['toast_item', t.type]" @click="dismiss(t.id)">
        <span class="toast_icon">{{ icons[t.type] }}</span>
        <span class="toast_message">{{ t.message }}</span>
      </div>
    </TransitionGroup>
  </Teleport>
</template>

<script setup>
import { ref } from 'vue'

const toasts = ref([])
const icons = { success: '✓', error: '✗', warning: '⚠', info: 'ℹ' }
let nextId = 0

function show(message, type = 'success', duration = 3500) {
  const id = nextId++
  toasts.value.push({ id, message, type })
  setTimeout(() => dismiss(id), duration)
}
function dismiss(id) { toasts.value = toasts.value.filter(t => t.id !== id) }

defineExpose({ show })
</script>

<style scoped>
.toast_container {
  position: fixed; top: 20px; right: 20px; z-index: 9999;
  display: flex; flex-direction: column; gap: 8px; pointer-events: none;
}
.toast_item {
  display: flex; align-items: center; gap: 10px; pointer-events: auto;
  padding: 12px 20px; border-radius: var(--radius-sm);
  font-size: 0.85rem; font-weight: 500; color: #fff; cursor: pointer;
  box-shadow: var(--shadow-lg); backdrop-filter: blur(8px);
  max-width: 380px;
}
.toast_item.success { background: var(--green); }
.toast_item.error { background: var(--red); }
.toast_item.warning { background: var(--amber); color: #1a1a2e; }
.toast_item.info { background: var(--blue); }
.toast_icon { font-size: 1rem; flex-shrink: 0; }

.toast-enter-active { transition: all 0.3s ease; }
.toast-leave-active { transition: all 0.2s ease; }
.toast-enter-from { opacity: 0; transform: translateX(40px); }
.toast-leave-to { opacity: 0; transform: translateX(40px); }
</style>
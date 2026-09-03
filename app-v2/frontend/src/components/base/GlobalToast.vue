<template>
  <Teleport to="body">
    <TransitionGroup name="gtoast" tag="div" class="gtoast-container">
      <div
        v-for="tt in toasts"
        :key="tt.id"
        :class="['gtoast-item', tt.type]"
        @click="dismissToast(tt.id)"
      >
        <span class="gtoast-icon">{{ icons[tt.type] || 'ℹ' }}</span>
        <span class="gtoast-msg">{{ tt.message }}</span>
        <span class="gtoast-close">✕</span>
      </div>
    </TransitionGroup>
  </Teleport>
</template>

<script setup>
import { toasts, dismissToast } from '@/lib/toast'
const icons = { success: '✓', error: '✗', warning: '⚠', info: 'ℹ' }
</script>

<style scoped>
.gtoast-container {
  position: fixed; top: 20px; right: 20px; z-index: 10000;
  display: flex; flex-direction: column; gap: 8px; pointer-events: none;
}
.gtoast-item {
  display: flex; align-items: center; gap: 10px; pointer-events: auto;
  padding: 12px 18px; border-radius: var(--radius-sm);
  font-size: 0.85rem; font-weight: 500; color: #fff; cursor: pointer;
  box-shadow: var(--shadow-lg); max-width: 400px;
}
.gtoast-item.success { background: var(--green); }
.gtoast-item.error { background: var(--red); }
.gtoast-item.warning { background: var(--amber); color: #1a1a2e; }
.gtoast-item.info { background: var(--blue, #3b82f6); }
.gtoast-icon { font-size: 1rem; flex-shrink: 0; }
.gtoast-msg { flex: 1; line-height: 1.4; }
.gtoast-close { font-size: 0.75rem; opacity: 0.7; flex-shrink: 0; }

.gtoast-enter-active { transition: all 0.3s ease; }
.gtoast-leave-active { transition: all 0.2s ease; }
.gtoast-enter-from { opacity: 0; transform: translateX(40px); }
.gtoast-leave-to { opacity: 0; transform: translateX(40px); }
</style>

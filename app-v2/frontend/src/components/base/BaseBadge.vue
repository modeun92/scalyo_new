<template>
  <span :class="['base-badge', color, size]">
    <span v-if="dot" class="badge-dot" />
    <slot />
  </span>
</template>

<script setup>
defineProps({
  color: { type: String, default: 'purple', validator: v => ['purple', 'green', 'red', 'amber', 'blue', 'gray'].includes(v) },
  size: { type: String, default: 'md', validator: v => ['sm', 'md'].includes(v) },
  dot: { type: Boolean, default: false }
})
</script>

<style scoped>
.base-badge {
  display: inline-flex; align-items: center; gap: 5px;
  font-weight: 600; border-radius: 6px; white-space: nowrap;
}
.base-badge.sm { font-size: 0.68rem; padding: 2px 8px; }
.base-badge.md { font-size: 0.75rem; padding: 4px 10px; }

.base-badge.purple { background: var(--purple-bg); color: var(--purple); }
.base-badge.green { background: var(--green-bg); color: var(--green); }
.base-badge.red { background: var(--red-bg); color: var(--red); }
.base-badge.amber { background: var(--amber-bg); color: var(--amber); }
.base-badge.blue { background: var(--blue-bg); color: var(--blue); }
.base-badge.gray { background: var(--bg-hover); color: var(--text-secondary); }

.badge-dot { width: 6px; height: 6px; border-radius: 50%; background: currentColor; }
</style>
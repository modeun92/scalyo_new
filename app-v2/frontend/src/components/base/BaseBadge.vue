<template>
  <span :class="['base_badge', color, size]">
    <span v-if="dot" class="badge_dot" />
    <slot />
  </span>
</template>

<script setup>
defineProps({
  color: { type: String, default: 'purple', validator: v => ['purple', 'green', 'red', 'amber', 'blue', 'gray'].includes(v) },
  size: { type: String, default: 'medium', validator: v => ['small', 'medium'].includes(v) },
  dot: { type: Boolean, default: false }
})
</script>

<style scoped>
.base_badge {
  display: inline-flex; align-items: center; gap: 5px;
  font-weight: 600; border-radius: 6px; white-space: nowrap;
}
.base_badge.small { font-size: 0.68rem; padding: 2px 8px; }
.base_badge.medium { font-size: 0.75rem; padding: 4px 10px; }

.base_badge.purple { background: var(--purple-bg); color: var(--purple); }
.base_badge.green { background: var(--green-bg); color: var(--green); }
.base_badge.red { background: var(--red-bg); color: var(--red); }
.base_badge.amber { background: var(--amber-bg); color: var(--amber); }
.base_badge.blue { background: var(--blue-bg); color: var(--blue); }
.base_badge.gray { background: var(--bg-hover); color: var(--text-secondary); }

.badge_dot { width: 6px; height: 6px; border-radius: 50%; background: currentColor; }
</style>
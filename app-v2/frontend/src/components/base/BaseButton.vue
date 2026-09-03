<template>
  <component
    :is="tag"
    :class="['base-btn', variant, size, { loading, block, disabled }]"
    :disabled="disabled || loading"
    :href="href"
    :to="to"
    v-bind="$attrs"
  >
    <span v-if="loading" class="btn-spinner" />
    <slot />
  </component>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  variant: { type: String, default: 'primary', validator: v => ['primary', 'outline', 'ghost', 'danger', 'success'].includes(v) },
  size: { type: String, default: 'md', validator: v => ['sm', 'md', 'lg'].includes(v) },
  loading: { type: Boolean, default: false },
  disabled: { type: Boolean, default: false },
  block: { type: Boolean, default: false },
  href: { type: String, default: null },
  to: { type: [String, Object], default: null }
})

const tag = computed(() => {
  if (props.to) return 'router-link'
  if (props.href) return 'a'
  return 'button'
})
</script>

<style scoped>
.base-btn {
  display: inline-flex; align-items: center; justify-content: center; gap: 8px;
  font-weight: 600; border-radius: var(--radius-sm); cursor: pointer;
  transition: all var(--transition); border: none; text-decoration: none;
  font-family: inherit; line-height: 1.2;
}
.base-btn.block { width: 100%; }
.base-btn.disabled, .base-btn:disabled { opacity: 0.5; cursor: not-allowed; pointer-events: none; }

/* Variants */
.base-btn.primary { background: linear-gradient(135deg, var(--purple), var(--purple-dark)); color: #fff; }
.base-btn.primary:hover { transform: translateY(-1px); box-shadow: 0 6px 20px rgba(124,58,237,0.35); }
.base-btn.outline { background: transparent; color: var(--text); border: 1px solid var(--border); }
.base-btn.outline:hover { border-color: var(--purple); color: var(--purple); }
.base-btn.ghost { background: transparent; color: var(--text-secondary); }
.base-btn.ghost:hover { color: var(--text); background: var(--bg-hover); }
.base-btn.danger { background: var(--red); color: #fff; }
.base-btn.danger:hover { transform: translateY(-1px); box-shadow: 0 6px 20px rgba(239,68,68,0.35); }
.base-btn.success { background: var(--green); color: #fff; }
.base-btn.success:hover { transform: translateY(-1px); box-shadow: 0 6px 20px rgba(16,185,129,0.35); }

/* Sizes */
.base-btn.sm { padding: 6px 14px; font-size: 0.78rem; border-radius: 8px; }
.base-btn.md { padding: 10px 22px; font-size: 0.85rem; border-radius: var(--radius-sm); }
.base-btn.lg { padding: 14px 32px; font-size: 0.95rem; border-radius: var(--radius-md); }

/* Spinner */
.btn-spinner {
  width: 14px; height: 14px; border: 2px solid rgba(255,255,255,0.3);
  border-top-color: #fff; border-radius: 50%; animation: spin 0.6s linear infinite;
}
.base-btn.outline .btn-spinner, .base-btn.ghost .btn-spinner { border-color: rgba(0,0,0,0.1); border-top-color: var(--purple); }
@keyframes spin { to { transform: rotate(360deg); } }
</style>
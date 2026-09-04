<template>
  <component
    :is="tag"
    :class="['base_button', variant, size, { loading, block, disabled }]"
    :disabled="disabled || loading"
    :href="href"
    :to="to"
    v-bind="$attrs"
  >
    <span v-if="loading" class="button_spinner" />
    <slot />
  </component>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  variant: { type: String, default: 'primary', validator: v => ['primary', 'outline', 'ghost', 'danger', 'success'].includes(v) },
  size: { type: String, default: 'medium', validator: v => ['small', 'medium', 'large'].includes(v) },
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
.base_button {
  display: inline-flex; align-items: center; justify-content: center; gap: 8px;
  font-weight: 600; border-radius: var(--radius-sm); cursor: pointer;
  transition: all var(--transition); border: none; text-decoration: none;
  font-family: inherit; line-height: 1.2;
}
.base_button.block { width: 100%; }
.base_button.disabled, .base_button:disabled { opacity: 0.5; cursor: not-allowed; pointer-events: none; }

/* Variants */
.base_button.primary { background: linear-gradient(135deg, var(--purple), var(--purple-dark)); color: #fff; }
.base_button.primary:hover { transform: translateY(-1px); box-shadow: 0 6px 20px rgba(124,58,237,0.35); }
.base_button.outline { background: transparent; color: var(--text); border: 1px solid var(--border); }
.base_button.outline:hover { border-color: var(--purple); color: var(--purple); }
.base_button.ghost { background: transparent; color: var(--text-secondary); }
.base_button.ghost:hover { color: var(--text); background: var(--bg-hover); }
.base_button.danger { background: var(--red); color: #fff; }
.base_button.danger:hover { transform: translateY(-1px); box-shadow: 0 6px 20px rgba(239,68,68,0.35); }
.base_button.success { background: var(--green); color: #fff; }
.base_button.success:hover { transform: translateY(-1px); box-shadow: 0 6px 20px rgba(16,185,129,0.35); }

/* Sizes */
.base_button.small { padding: 6px 14px; font-size: 0.78rem; border-radius: 8px; }
.base_button.medium { padding: 10px 22px; font-size: 0.85rem; border-radius: var(--radius-sm); }
.base_button.large { padding: 14px 32px; font-size: 0.95rem; border-radius: var(--radius-md); }

/* Spinner */
.button_spinner {
  width: 14px; height: 14px; border: 2px solid rgba(255,255,255,0.3);
  border-top-color: #fff; border-radius: 50%; animation: spin 0.6s linear infinite;
}
.base_button.outline .button_spinner, .base_button.ghost .button_spinner { border-color: rgba(0,0,0,0.1); border-top-color: var(--purple); }
@keyframes spin { to { transform: rotate(360deg); } }
</style>
<template>
  <!-- NO-CONFIRM: confirmation INSIDE the product, never a native confirm() (which also blocks
       any automated evidence capture). Extracted from TeamManagementView (SEAT-RM D3①).
       Title and body in <div>, not h4/p: the dark theme forces !important on bare
       tags (CSS-DARK-IMPORTANT). -->
  <div class="confirm_overlay" @click.self="onCancel" @keydown.esc.stop.prevent="onCancel">
    <div class="confirm_card" role="dialog" aria-modal="true" :aria-label="title">
      <div class="confirm_title">{{ title }}</div>
      <div v-if="body" class="confirm_body">{{ body }}</div>
      <div class="confirm_actions">
        <button ref="cancelBtn" type="button" class="button_ghost" :disabled="busy" @click="onCancel">{{ cancelLabel || t('cf_cancel') }}</button>
        <button type="button" :class="danger ? 'button_danger' : 'button_confirm'" :disabled="busy" @click="$emit('confirm')">
          <span v-if="busy" class="spinner_small" /><span v-else>{{ cta || t('cf_confirm') }}</span>
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'

const props = defineProps({
  title: { type: String, required: true },
  body: { type: String, default: '' },
  cta: { type: String, default: '' },
  cancelLabel: { type: String, default: '' },
  busy: { type: Boolean, default: false },
  danger: { type: Boolean, default: true },
})
const emit = defineEmits(['confirm', 'cancel'])
const { t } = useI18n({ useScope: 'global' })
const cancelBtn = ref(null)

function onCancel() { if (!props.busy) emit('cancel') }
// Focus starts on "Cancel": pressing Enter by reflex never runs the destructive action.
onMounted(() => { cancelBtn.value?.focus() })
</script>

<style scoped>
.confirm_overlay { position: fixed; inset: 0; background: rgba(15,23,42,0.45); display: flex; align-items: center; justify-content: center; padding: 20px; z-index: 60; }
.confirm_card { background: var(--card-bg, #fff); border-radius: 14px; padding: 24px; max-width: 420px; width: 100%; box-shadow: 0 20px 60px rgba(0,0,0,0.25); }
.confirm_title { font-size: 1.02rem; font-weight: 700; color: var(--text-primary); margin-bottom: 10px; }
.confirm_body { font-size: 0.88rem; line-height: 1.55; color: var(--text-secondary, #6b7280); margin-bottom: 20px; white-space: pre-line; }
.confirm_actions { display: flex; gap: 10px; justify-content: flex-end; }
.button_ghost { background: none; border: 1px solid var(--border-color); color: var(--text-primary); padding: 9px 16px; border-radius: 8px; font-size: 0.85rem; font-weight: 600; cursor: pointer; }
.button_ghost:hover:not(:disabled) { background: #f9fafb; }
.button_danger { background: #dc2626; color: #fff; border: none; padding: 9px 18px; border-radius: 8px; font-size: 0.85rem; font-weight: 600; cursor: pointer; min-width: 110px; }
.button_danger:hover:not(:disabled) { background: #b91c1c; }
.button_confirm { background: var(--purple); color: #fff; border: none; padding: 9px 18px; border-radius: 8px; font-size: 0.85rem; font-weight: 600; cursor: pointer; min-width: 110px; }
.button_confirm:hover:not(:disabled) { background: var(--purple-dark); }
.button_ghost:disabled, .button_danger:disabled, .button_confirm:disabled { opacity: 0.5; cursor: not-allowed; }
.spinner_small { width: 14px; height: 14px; border: 2px solid rgba(255,255,255,0.3); border-top-color: #fff; border-radius: 50%; animation: cf-spin 0.7s linear infinite; display: inline-block; }
@keyframes cf-spin { to { transform: rotate(360deg); } }
@media (max-width: 640px) { .confirm_actions { flex-direction: column-reverse; } .confirm_actions button { width: 100%; } }
</style>

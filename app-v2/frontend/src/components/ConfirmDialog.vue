<template>
  <!-- NO-CONFIRM : confirmation DANS le produit, jamais confirm() natif (bloque aussi
       toute preuve automatisée). Extrait de TeamManagementView (SEAT-RM D3①).
       Titre et corps en <div>, pas h4/p : le thème sombre force !important sur les
       balises nues (CSS-DARK-IMPORTANT). -->
  <div class="cf-overlay" @click.self="onCancel" @keydown.esc.stop.prevent="onCancel">
    <div class="cf-card" role="dialog" aria-modal="true" :aria-label="title">
      <div class="cf-title">{{ title }}</div>
      <div v-if="body" class="cf-body">{{ body }}</div>
      <div class="cf-actions">
        <button ref="cancelBtn" type="button" class="btn-ghost" :disabled="busy" @click="onCancel">{{ cancelLabel || t('cf_cancel') }}</button>
        <button type="button" :class="danger ? 'btn-danger' : 'btn-confirm'" :disabled="busy" @click="$emit('confirm')">
          <span v-if="busy" class="spinner-sm" /><span v-else>{{ cta || t('cf_confirm') }}</span>
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
// Le focus part sur « Annuler » : Entrée par réflexe n'exécute jamais le geste destructif.
onMounted(() => { cancelBtn.value?.focus() })
</script>

<style scoped>
.cf-overlay { position: fixed; inset: 0; background: rgba(15,23,42,0.45); display: flex; align-items: center; justify-content: center; padding: 20px; z-index: 60; }
.cf-card { background: var(--card-bg, #fff); border-radius: 14px; padding: 24px; max-width: 420px; width: 100%; box-shadow: 0 20px 60px rgba(0,0,0,0.25); }
.cf-title { font-size: 1.02rem; font-weight: 700; color: var(--text-primary); margin-bottom: 10px; }
.cf-body { font-size: 0.88rem; line-height: 1.55; color: var(--text-secondary, #6b7280); margin-bottom: 20px; white-space: pre-line; }
.cf-actions { display: flex; gap: 10px; justify-content: flex-end; }
.btn-ghost { background: none; border: 1px solid var(--border-color); color: var(--text-primary); padding: 9px 16px; border-radius: 8px; font-size: 0.85rem; font-weight: 600; cursor: pointer; }
.btn-ghost:hover:not(:disabled) { background: #f9fafb; }
.btn-danger { background: #dc2626; color: #fff; border: none; padding: 9px 18px; border-radius: 8px; font-size: 0.85rem; font-weight: 600; cursor: pointer; min-width: 110px; }
.btn-danger:hover:not(:disabled) { background: #b91c1c; }
.btn-confirm { background: var(--purple); color: #fff; border: none; padding: 9px 18px; border-radius: 8px; font-size: 0.85rem; font-weight: 600; cursor: pointer; min-width: 110px; }
.btn-confirm:hover:not(:disabled) { background: var(--purple-dark); }
.btn-ghost:disabled, .btn-danger:disabled, .btn-confirm:disabled { opacity: 0.5; cursor: not-allowed; }
.spinner-sm { width: 14px; height: 14px; border: 2px solid rgba(255,255,255,0.3); border-top-color: #fff; border-radius: 50%; animation: cf-spin 0.7s linear infinite; display: inline-block; }
@keyframes cf-spin { to { transform: rotate(360deg); } }
@media (max-width: 640px) { .cf-actions { flex-direction: column-reverse; } .cf-actions button { width: 100%; } }
</style>

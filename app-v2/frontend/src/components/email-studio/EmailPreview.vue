<template>
<div class="es-right">
  <div v-if="selected" class="es-preview">
    <div class="esp-header">
      <h2>{{ selected.source === 'custom' ? selected.name : t(selected.nameKey) }}</h2>
      <div class="esp-actions">
        <span class="esp-cat" :class="catClass(selected.categoryKey || selected.category)">
          {{ t('es_cat_' + (selected.categoryKey || selected.category)) }}
        </span>
        <button class="btn-outline" @click="resetToTemplate" :title="t('es_reset')">
          {{ t('es_reset') }}
        </button>
        <button class="btn-outline" @click="$emit('save-template')" :title="t('es_save_template')">
          {{ t('es_save_template') }}
        </button>
        <button class="btn-primary" @click="copyEmail">
          {{ copied ? t('es_copied') : t('es_copy') }}
        </button>
        <template v-if="isElite">
          <button class="btn-send" @click="$emit('open-send')" :disabled="!selected || !hasResendKey">
            {{ !hasResendKey ? t('es_resend_required') : t('es_send') }}
          </button>
        </template>
        <template v-else>
          <div class="es-elite-gate" :title="t('es_elite_tooltip')">
            <span>{{ t('es_elite_badge') }}</span>
          </div>
        </template>
      </div>
    </div>

    <div class="esp-field">
      <label class="esp-label">{{ t('es_subject') }}</label>
      <input
        type="text"
        class="esp-input"
        :value="editSubject"
        @input="$emit('update:editSubject', $event.target.value)"
        :placeholder="t('es_subject_placeholder')"
      />
    </div>

    <div class="esp-field">
      <label class="esp-label">{{ t('es_body') }}</label>
      <textarea
        class="esp-textarea"
        :value="editBody"
        @input="$emit('update:editBody', $event.target.value)"
        :placeholder="t('es_body_placeholder')"
        rows="14"
      />
    </div>
  </div>

  <div v-else class="esp-empty">
    <span class="esp-empty-icon">\ud83d\udce7</span>
    <p>{{ t('es_preview') }}</p>
  </div>
</div>
</template>

<script setup>
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { catClass, htmlToPlainText } from './emailTemplates.js'

const { t } = useI18n({ useScope: 'global' })

const props = defineProps({
  selected: { type: Object, default: null },
  isElite: { type: Boolean, default: false },
  hasResendKey: { type: Boolean, default: false },
  editSubject: { type: String, default: '' },
  editBody: { type: String, default: '' },
})

const emit = defineEmits(['open-send', 'update:editSubject', 'update:editBody', 'save-template'])

const copied = ref(false)

function copyEmail() {
  const text = props.editSubject + '\n\n' + props.editBody
  navigator.clipboard.writeText(text)
  copied.value = true
  setTimeout(() => (copied.value = false), 2000)
}

function resetToTemplate() {
  if (!props.selected) return
  if (props.selected.source === 'custom') {
    emit('update:editSubject', props.selected.subject || '')
    emit('update:editBody', props.selected.body || '')
  } else {
    emit('update:editSubject', t(props.selected.subjectKey))
    // EMAIL-NEWLINES : conversion structurelle HTML → texte (source unique emailTemplates)
    emit('update:editBody', htmlToPlainText(t(props.selected.bodyKey)))
  }
}
</script>

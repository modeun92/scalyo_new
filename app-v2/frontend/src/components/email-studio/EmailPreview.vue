<template>
<div class="email_studio_right">
  <div v-if="selected" class="email_studio_preview">
    <div class="email_studio_preview_header">
      <h2>{{ selected.source === 'custom' ? selected.name : t(selected.nameKey) }}</h2>
      <div class="email_studio_preview_actions">
        <span class="email_studio_preview_category" :class="catClass(selected.categoryKey || selected.category)">
          {{ t('es_cat_' + (selected.categoryKey || selected.category)) }}
        </span>
        <button class="button_outline" @click="resetToTemplate" :title="t('es_reset')">
          {{ t('es_reset') }}
        </button>
        <button class="button_outline" @click="$emit('save-template')" :title="t('es_save_template')">
          {{ t('es_save_template') }}
        </button>
        <button class="button_primary" @click="copyEmail">
          {{ copied ? t('es_copied') : t('es_copy') }}
        </button>
        <template v-if="isElite">
          <button class="button_send" @click="$emit('open-send')" :disabled="!selected || !hasResendKey">
            {{ !hasResendKey ? t('es_resend_required') : t('es_send') }}
          </button>
        </template>
        <template v-else>
          <div class="email_studio_elite_gate" :title="t('es_elite_tooltip')">
            <span>{{ t('es_elite_badge') }}</span>
          </div>
        </template>
      </div>
    </div>

    <div class="email_studio_preview_field">
      <label class="email_studio_preview_label">{{ t('es_subject') }}</label>
      <input
        type="text"
        class="email_studio_preview_input"
        :value="editSubject"
        @input="$emit('update:editSubject', $event.target.value)"
        :placeholder="t('es_subject_placeholder')"
      />
    </div>

    <div class="email_studio_preview_field">
      <label class="email_studio_preview_label">{{ t('es_body') }}</label>
      <textarea
        class="email_studio_preview_textarea"
        :value="editBody"
        @input="$emit('update:editBody', $event.target.value)"
        :placeholder="t('es_body_placeholder')"
        rows="14"
      />
    </div>
  </div>

  <div v-else class="email_studio_preview_empty">
    <span class="email_studio_preview_empty_icon">📧</span>
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

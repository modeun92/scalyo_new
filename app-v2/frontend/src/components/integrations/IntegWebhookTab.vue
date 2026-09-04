<template>
  <div class="iv_section">
    <div class="iv_card">
      <div class="iv_card_header">
        <div>
          <h2>⚡ {{ t('integration_webhook_title') }}</h2>
          <p class="iv_card_sub">{{ t('integration_webhook_description') }}</p>
        </div>
        <button class="button_create_key" @click="$emit('create')">+ {{ t('integration_create_webhook') }}</button>
      </div>

      <div v-if="webhooks.length === 0" class="iv_empty">
        <p>{{ t('integration_no_webhooks') }}</p>
      </div>

      <div v-for="wh in webhooks" :key="wh.id" class="iv_webhook_row">
        <div class="iv_wh_info">
          <span class="iv_key_name">{{ wh.name }}</span>
          <div class="iv_wh_url_row">
            <span class="iv_info_label">URL</span>
            <code class="iv_code_small">{{ getWebhookUrl(wh) }}</code>
            <button class="button_copy_small" @click="copy(getWebhookUrl(wh))">📋</button>
          </div>
          <div class="iv_wh_url_row">
            <span class="iv_info_label">Secret</span>
            <code class="iv_code_small">{{ wh.secret }}</code>
            <button class="button_copy_small" @click="copy(wh.secret)">📋</button>
          </div>
        </div>
        <div class="iv_key_meta">
          <span>{{ wh.trigger_count || 0 }} {{ t('integration_webhook_calls') }}</span>
          <span v-if="wh.last_triggered_at">
            {{ t('integration_webhook_last') }}: {{ formatDate(wh.last_triggered_at) }}
          </span>
        </div>
        <button class="button_revoke" @click="$emit('delete', wh.id)">🗑️</button>
      </div>

      <!-- Instructions -->
      <div class="iv_doc_section">
        <h3>🔧 {{ t('integration_webhook_howto') }}</h3>
        <div class="iv_steps">
          <div class="iv_step" v-for="(step, i) in 4" :key="i">
            <span class="iv_step_number">{{ i + 1 }}</span>
            <div v-html="t('integration_webhook_step' + (i + 1))"></div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { useI18n } from 'vue-i18n'

const { t } = useI18n({ useScope: 'global' })

const props = defineProps({
  webhooks: { type: Array, default: () => [] },
  webhookBaseUrl: { type: String, default: '' }
})

defineEmits(['create', 'delete'])

function getWebhookUrl(wh) {
  return props.webhookBaseUrl + '?user=' + wh.user_id + '&event=client.created'
}

function formatDate(d) {
  if (!d) return ''
  return new Date(d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })
}

function copy(text) {
  navigator.clipboard.writeText(text).catch(() => {})
}
</script>

<template>
  <div class="iv-section">
    <div class="iv-card">
      <div class="iv-card-header">
        <div>
          <h2>⚡ {{ t('integ_webhook_title') }}</h2>
          <p class="iv-card-sub">{{ t('integ_webhook_desc') }}</p>
        </div>
        <button class="btn-create-key" @click="$emit('create')">+ {{ t('integ_create_webhook') }}</button>
      </div>

      <div v-if="webhooks.length === 0" class="iv-empty">
        <p>{{ t('integ_no_webhooks') }}</p>
      </div>

      <div v-for="wh in webhooks" :key="wh.id" class="iv-webhook-row">
        <div class="iv-wh-info">
          <span class="iv-key-name">{{ wh.name }}</span>
          <div class="iv-wh-url-row">
            <span class="iv-info-label">URL</span>
            <code class="iv-code-sm">{{ getWebhookUrl(wh) }}</code>
            <button class="btn-copy-sm" @click="copy(getWebhookUrl(wh))">📋</button>
          </div>
          <div class="iv-wh-url-row">
            <span class="iv-info-label">Secret</span>
            <code class="iv-code-sm">{{ wh.secret }}</code>
            <button class="btn-copy-sm" @click="copy(wh.secret)">📋</button>
          </div>
        </div>
        <div class="iv-key-meta">
          <span>{{ wh.trigger_count || 0 }} {{ t('integ_wh_calls') }}</span>
          <span v-if="wh.last_triggered_at">
            {{ t('integ_wh_last') }}: {{ formatDate(wh.last_triggered_at) }}
          </span>
        </div>
        <button class="btn-revoke" @click="$emit('delete', wh.id)">🗑️</button>
      </div>

      <!-- Instructions -->
      <div class="iv-doc-section">
        <h3>🔧 {{ t('integ_wh_howto') }}</h3>
        <div class="iv-steps">
          <div class="iv-step" v-for="(step, i) in 4" :key="i">
            <span class="iv-step-num">{{ i + 1 }}</span>
            <div v-html="t('integ_wh_step' + (i + 1))"></div>
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

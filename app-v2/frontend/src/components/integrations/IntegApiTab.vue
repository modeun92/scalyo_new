<template>
  <div class="iv_section">
    <div class="iv_card">
      <div class="iv_card_header">
        <div>
          <h2>🔑 {{ t('integration_api_title') }}</h2>
          <p class="iv_card_sub">{{ t('integration_api_description') }}</p>
        </div>
        <button class="button_create_key" @click="$emit('open-create')">+ {{ t('integration_create_key') }}</button>
      </div>

      <!-- Base URL -->
      <div class="iv_info_box">
        <span class="iv_info_label">Base URL</span>
        <code class="iv_code">{{ apiBaseUrl }}</code>
        <button class="button_copy_small" @click="copy(apiBaseUrl)">📋</button>
      </div>

      <!-- Keys list -->
      <div v-if="apiKeys.length === 0" class="iv_empty">
        <p>{{ t('integration_no_keys') }}</p>
      </div>
      <div v-else class="iv_keys_list">
        <div v-for="key in apiKeys" :key="key.id" class="iv_key_row">
          <div class="iv_key_info">
            <span class="iv_key_name">{{ key.name }}</span>
            <code class="iv_key_prefix">{{ key.key_prefix }}••••••••</code>
            <span class="iv_key_scopes">{{ key.scopes?.join(', ') }}</span>
          </div>
          <div class="iv_key_meta">
            <span class="iv_key_date">{{ t('integration_created') }} {{ formatDate(key.created_at) }}</span>
            <span v-if="key.last_used_at" class="iv_key_used">
              {{ t('integration_used') }} {{ formatDate(key.last_used_at) }}
            </span>
            <span v-else class="iv_key_unused">{{ t('integration_never_used') }}</span>
          </div>
          <button class="button_revoke" @click="$emit('revoke', key.id)" :title="t('integration_revoke_key')">🗑️</button>
        </div>
      </div>

      <!-- New key reveal -->
      <div v-if="newKeyValue" class="iv_new_key_reveal">
        <p>⚠️ {{ t('integration_key_shown_once') }}</p>
        <code class="iv_new_key_code">{{ newKeyValue }}</code>
        <button class="button_copy" @click="copy(newKeyValue); $emit('key-copied')">
          {{ keyCopied ? '✓ ' + t('integration_copied') : '📋 ' + t('integration_copy_key') }}
        </button>
      </div>

      <!-- Documentation -->
      <div class="iv_doc_section">
        <h3>📖 {{ t('integration_endpoints') }}</h3>
        <div class="iv_endpoints">
          <div v-for="ep in endpoints" :key="ep.method + ep.path" class="iv_endpoint">
            <span class="iv_method" :class="ep.method.toLowerCase()">{{ ep.method }}</span>
            <code class="iv_path">{{ ep.path }}</code>
            <span class="iv_ep_description">{{ ep.desc }}</span>
          </div>
        </div>
        <div class="iv_example">
          <h4>{{ t('integration_curl_example') }}</h4>
          <code class="iv_code_block">curl -H "x-api-key: sk_..." {{ apiBaseUrl }}/clients</code>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { useI18n } from 'vue-i18n'

const { t } = useI18n({ useScope: 'global' })

defineProps({
  apiKeys: { type: Array, default: () => [] },
  apiBaseUrl: { type: String, default: '' },
  newKeyValue: { type: String, default: '' },
  keyCopied: { type: Boolean, default: false }
})

defineEmits(['open-create', 'revoke', 'key-copied'])

const endpoints = [
  { method: 'GET', path: '/clients', desc: 'List all clients' },
  { method: 'POST', path: '/clients', desc: 'Create a client' },
  { method: 'PUT', path: '/clients/:id', desc: 'Update a client' },
  { method: 'DELETE', path: '/clients/:id', desc: 'Delete a client' },
  { method: 'GET', path: '/team', desc: 'List team members' },
  { method: 'POST', path: '/team', desc: 'Add a member' },
  { method: 'GET', path: '/tasks', desc: 'List tasks' },
  { method: 'POST', path: '/tasks', desc: 'Create a task' },
  { method: 'GET', path: '/me', desc: 'Account info' }
]

function formatDate(d) {
  if (!d) return ''
  return new Date(d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })
}

function copy(text) {
  navigator.clipboard.writeText(text).catch(() => {})
}
</script>

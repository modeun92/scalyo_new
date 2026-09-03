<template>
  <div class="iv-section">
    <div class="iv-card">
      <div class="iv-card-header">
        <div>
          <h2>🔑 {{ t('integ_api_title') }}</h2>
          <p class="iv-card-sub">{{ t('integ_api_desc') }}</p>
        </div>
        <button class="btn-create-key" @click="$emit('open-create')">+ {{ t('integ_create_key') }}</button>
      </div>

      <!-- Base URL -->
      <div class="iv-info-box">
        <span class="iv-info-label">Base URL</span>
        <code class="iv-code">{{ apiBaseUrl }}</code>
        <button class="btn-copy-sm" @click="copy(apiBaseUrl)">📋</button>
      </div>

      <!-- Keys list -->
      <div v-if="apiKeys.length === 0" class="iv-empty">
        <p>{{ t('integ_no_keys') }}</p>
      </div>
      <div v-else class="iv-keys-list">
        <div v-for="key in apiKeys" :key="key.id" class="iv-key-row">
          <div class="iv-key-info">
            <span class="iv-key-name">{{ key.name }}</span>
            <code class="iv-key-prefix">{{ key.key_prefix }}••••••••</code>
            <span class="iv-key-scopes">{{ key.scopes?.join(', ') }}</span>
          </div>
          <div class="iv-key-meta">
            <span class="iv-key-date">{{ t('integ_created') }} {{ formatDate(key.created_at) }}</span>
            <span v-if="key.last_used_at" class="iv-key-used">
              {{ t('integ_used') }} {{ formatDate(key.last_used_at) }}
            </span>
            <span v-else class="iv-key-unused">{{ t('integ_never_used') }}</span>
          </div>
          <button class="btn-revoke" @click="$emit('revoke', key.id)" :title="t('integ_revoke_key')">🗑️</button>
        </div>
      </div>

      <!-- New key reveal -->
      <div v-if="newKeyValue" class="iv-new-key-reveal">
        <p>⚠️ {{ t('integ_key_shown_once') }}</p>
        <code class="iv-new-key-code">{{ newKeyValue }}</code>
        <button class="btn-copy" @click="copy(newKeyValue); $emit('key-copied')">
          {{ keyCopied ? '✓ ' + t('integ_copied') : '📋 ' + t('integ_copy_key') }}
        </button>
      </div>

      <!-- Documentation -->
      <div class="iv-doc-section">
        <h3>📖 {{ t('integ_endpoints') }}</h3>
        <div class="iv-endpoints">
          <div v-for="ep in endpoints" :key="ep.method + ep.path" class="iv-endpoint">
            <span class="iv-method" :class="ep.method.toLowerCase()">{{ ep.method }}</span>
            <code class="iv-path">{{ ep.path }}</code>
            <span class="iv-ep-desc">{{ ep.desc }}</span>
          </div>
        </div>
        <div class="iv-example">
          <h4>{{ t('integ_curl_example') }}</h4>
          <code class="iv-code-block">curl -H "x-api-key: sk_..." {{ apiBaseUrl }}/clients</code>
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

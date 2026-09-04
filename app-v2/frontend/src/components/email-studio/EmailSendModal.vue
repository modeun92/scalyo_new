<template>
<div class="send_modal_overlay" @click.self="$emit('close')">
  <div class="send_modal">
    <div class="send_modal_header">
      <h3>{{ t('es_send_title') }}</h3>
      <button class="send_modal_close" @click="$emit('close')">\u2715</button>
    </div>
    <div class="send_modal_body">
      <div v-if="sendResult?.success" class="send_modal_success">
        \u2705 {{ t('es_send_success') }}
      </div>
      <div v-else-if="sendResult?.error" class="send_modal_error">
        \u274c {{ sendResult.error }}
      </div>
      <template v-else>
      <div class="send_modal_field">
        <label>{{ t('es_send_client') }}</label>
        <select v-model="selectedClientId" class="send_modal_input" @change="onClientSelect">
          <option value="">{{ t('es_send_client_placeholder') }}</option>
          <option v-for="c in clients" :key="c.id" :value="c.id">{{ c.name }}</option>
        </select>
      </div>
        <div class="send_modal_field">
          <label>{{ t('es_send_to') }}</label>
          <input v-model="sendTo" type="email" :placeholder="t('es_send_to_placeholder')" class="send_modal_input" />
        </div>
        <div class="send_modal_field">
          <label>{{ t('es_send_from_name') }}</label>
          <input v-model="sendFromName" type="text" :placeholder="auth.fullName || t('es_send_from_placeholder')" class="send_modal_input" />
        </div>
        
      <div class="send_modal_sender_info">
        <span>{{ t('es_send_via') }} contact@scalyo.app</span>
      </div>
<div class="send_modal_preview">
          <strong>{{ t('es_subject') }} :</strong> {{ editSubject }}
        </div>
        <div class="send_modal_preview send_modal_preview_body">
          <strong>{{ t('es_body') }} :</strong>
          <p class="send_modal_body_text">{{ editBody.substring(0, 200) }}{{ editBody.length > 200 ? '...' : '' }}</p>
        </div>
        <button class="button_primary send_modal_send_button" @click="sendEmail" :disabled="!sendTo || sending">
          {{ sending ? t('es_sending') : t('es_send_btn') }}
        </button>
      </template>
    </div>
  </div>
</div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useAuthStore } from '@/stores/auth'
import { useClientStore } from '@/stores/clients'
import { supabase } from '@/lib/supabase'

const { t } = useI18n({ useScope: 'global' })
const auth = useAuthStore()
const clientStore = useClientStore()
const clients = computed(() => clientStore.clients || [])
const selectedClientId = ref('')

function onClientSelect() {
  const client = clients.value.find(c => c.id === selectedClientId.value)
  if (client) {
    const contact = Array.isArray(client.contacts) && client.contacts[0]
    if (contact && contact.email) sendTo.value = contact.email
  }
}

const props = defineProps({
  selected: { type: Object, default: null },
  editSubject: { type: String, default: '' },
  editBody: { type: String, default: '' },
})

const emit = defineEmits(['close'])
const sendTo = ref('')
const sendFromName = ref('')
const sending = ref(false)
const sendResult = ref(null)

async function sendEmail() {
  if (!sendTo.value || !props.editSubject) return
  sending.value = true
  sendResult.value = null

  try {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session?.access_token) {
      sendResult.value = { error: t('es_send_auth_error') || 'Session expired' }
      return
    }

    const htmlBody = props.editBody
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/\n/g, '<br>')

    const resp = await fetch('/api/email', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + session.access_token,
      },
      body: JSON.stringify({
        to: sendTo.value,
        subject: props.editSubject,
        html: '<div style="font-family:-apple-system,BlinkMacSystemFont,sans-serif;line-height:1.6;max-width:600px;margin:0 auto">' + htmlBody + '</div>',
        from_name: sendFromName.value || auth.fullName || 'Scalyo',
        replyTo: auth.user?.email,
      }),
    })

    const data = await resp.json()

    if (resp.ok && (data.sent || data.success)) {
      sendResult.value = { success: true }
      sendTo.value = ''
      setTimeout(() => { emit('close'); sendResult.value = null }, 2000)
    } else {
      sendResult.value = { error: data.error || t('es_send_error') || 'Send failed' }
    }
  } catch (e) {
    sendResult.value = { error: e.message || t('es_send_error') }
  } finally {
    sending.value = false
  }
}
</script>

<style scoped>
.send_modal_sender_info {
  padding: 8px 0;
  font-size: 13px;
  color: #888;
  font-style: italic;
}
.send_modal_input {
  width: 100%;
  padding: 10px 12px;
  border: 1px solid #ddd;
  border-radius: 8px;
  font-size: 14px;
  background-color: var(--bg-card);
  appearance: none;
}
.send_modal_input:focus {
  outline: none;
  border-color: #7c5cfc;
}
@media (max-width: 640px) {
  .send_modal {
    width: 95vw !important;
    max-height: 90vh;
    margin: 5vh auto;
    border-radius: 12px;
  }
  .send_modal_body {
    max-height: 70vh;
    overflow-y: auto;
  }
  .send_modal_field input,
  .send_modal_field select,
  .send_modal_field textarea {
    font-size: 16px;
  }
  .send_modal_actions {
    flex-direction: column;
    gap: 8px;
  }
  .send_modal_actions button {
    width: 100%;
  }
}
</style>

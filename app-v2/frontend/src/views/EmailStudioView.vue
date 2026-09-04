<template>
<div class="email_studio">
  <div class="email_studio_header">
    <h1>{{ t('es_title') }}</h1>
    <p class="email_studio_sub">{{ t('es_subtitle') }}</p>
  </div>

  <!-- CR-D: the store's failures are displayed (the view used to be mute) — ChatPanel C-07 pattern -->
  <div v-if="store.lastError" class="email_studio_error_toast">
    <span>{{ t('es_err_' + store.lastError) }}</span>
    <button class="email_studio_error_close" @click="store.clearError()">✕</button>
  </div>

  <div :class="['email_studio_email_banner', store.emailConfigured ? 'connected' : 'setup_needed']">
    <span class="email_studio_banner_icon">{{ store.emailConfigured ? '\u2705' : '\u26a0\ufe0f' }}</span>
    <div class="email_studio_banner_text">
      <strong>{{ store.emailConfigured ? t('es_resend_connected') : t('es_resend_setup_title') }}</strong>
      <span>{{ store.emailConfigured ? t('es_resend_connected_desc') : t('es_resend_setup_desc') }}</span>
    </div>
    <router-link v-if="!store.emailConfigured" to="/app/settings?tab=integrations" class="email_studio_banner_link">
      {{ t('es_resend_setup_link') }}
    </router-link>
  </div>

  <AiInsightPanel
    module="email"
    :title="t('ai_email_title')"
    :button-label="t('ai_email_btn')"
    :message="t('ai_email_prompt')"
    :context="{ selectedTemplate: selected?.id, currentSubject: editSubject, currentBody: editBody }"
    @result="onAiResult"
  />

  <div v-if="activeTab !== 'history'" class="email_studio_layout">
    <EmailTemplateList
      :active-tab="activeTab"
      :active-cat="activeCat"
      :selected-id="selectedId"
      :search="search"
      :custom-templates="store.customTemplates"
      @update:activeTab="activeTab = $event"
      @update:activeCat="activeCat = $event"
      @update:selectedId="onSelectTemplate"
      @update:search="search = $event"
    />
    <EmailPreview
      :selected="selected"
      :is-elite="isElite"
      :has-resend-key="store.emailConfigured"
      :edit-subject="editSubject"
      :edit-body="editBody"
      @update:editSubject="editSubject = $event"
      @update:editBody="editBody = $event"
      @open-send="openSendModal"
      @save-template="onSaveTemplate"
    />
  </div>

  <div v-else>
    <div class="email_studio_tabs" style="max-width: 340px; margin-bottom: 16px;">
      <button v-for="tab in tabKeys" :key="tab.key" class="email_studio_tab" :class="{ active: activeTab === tab.key }" @click="activeTab = tab.key">
        {{ t(tab.label) }}
      </button>
    </div>
    <EmailHistory :is-elite="isElite" :sent-emails="store.sentEmails" />
  </div>

  <EmailSendModal v-if="showSendModal" :selected="selected" :edit-subject="editSubject" :edit-body="editBody" @close="showSendModal = false" @sent="store.loadSentEmails()" />
  <ResendSetupWizard v-if="showResendWizard" @close="showResendWizard = false" @connected="store.loadEmailConfig()" />
</div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useAuthStore } from '@/stores/auth'
import { useEmailStudioStore } from '@/stores/emailStudio'
import { templates as defaultTemplates, htmlToPlainText } from '@/components/email-studio/emailTemplates.js'
import { hasFeature } from '@/config/plans.config.js'
import EmailTemplateList from '@/components/email-studio/EmailTemplateList.vue'
import EmailPreview from '@/components/email-studio/EmailPreview.vue'
import EmailHistory from '@/components/email-studio/EmailHistory.vue'
import EmailSendModal from '@/components/email-studio/EmailSendModal.vue'
import ResendSetupWizard from '@/components/modals/ResendSetupWizard.vue'
import AiInsightPanel from '@/components/ai/AiInsightPanel.vue'
import '@/assets/emailStudio.css'

const { t } = useI18n({ useScope: 'global' })
const auth = useAuthStore()
const store = useEmailStudioStore()

const activeTab = ref('all')
const activeCat = ref('all')
const search = ref('')
const selectedId = ref(null)
const showSendModal = ref(false)
const showResendWizard = ref(false)
const editSubject = ref('')
const editBody = ref('')

// CR-2 source unique : elite ET enterprise ont aiEmailStudio (contrat gating 8/07)
const isElite = computed(() => hasFeature(auth.currentPlan, 'aiEmailStudio'))

const selected = computed(() => {
  if (!selectedId.value) return null
  // Check default templates first
  const def = defaultTemplates.find(tpl => tpl.id === selectedId.value)
  if (def) return { ...def, source: 'default' }
  // Check custom templates
  const custom = store.customTemplates.find(tpl => tpl.id === selectedId.value)
  if (custom) return { ...custom, source: 'custom' }
  return null
})

const tabKeys = [
  { key: 'all', label: 'es_tab_all' },
  { key: 'csm', label: 'es_tab_csm' },
  { key: 'commercial', label: 'es_tab_commercial' },
  { key: 'kam', label: 'es_tab_kam' },
  { key: 'history', label: 'es_tab_history' }
]

onMounted(() => { store.init() })

function onSelectTemplate(id) {
  selectedId.value = id
  const tpl = selected.value
  if (!tpl) return

  if (tpl.source === 'default') {
    editSubject.value = t(tpl.subjectKey)
    // EMAIL-NEWLINES: structural HTML → text conversion (never again a glued strip)
    editBody.value = htmlToPlainText(t(tpl.bodyKey))
  } else {
    editSubject.value = tpl.subject || ''
    editBody.value = tpl.body || ''
  }
}

function openSendModal() { showSendModal.value = true }

function onAiResult(result) {
  if (result?.response) { editBody.value = result.response }
}

async function onSaveTemplate() {
  if (!editSubject.value || !editBody.value) return
  const saved = await store.saveTemplate({
    name: editSubject.value.substring(0, 60),
    subject: editSubject.value,
    body: editBody.value,
    category: selected.value?.categoryKey || 'custom',
    lang: auth.profile?.locale || 'fr',
  })
  if (saved) { selectedId.value = saved.id }
}
</script>

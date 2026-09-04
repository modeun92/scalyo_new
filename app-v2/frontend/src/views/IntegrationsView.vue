<template>
  <div class="integrations_page">
    <header class="integration_header">
      <h1>{{ t('integ_title') }}</h1>
      <p class="integration_sub">{{ t('integ_subtitle') }}</p>
    </header>
    <div v-if="loading" class="integration_loading"><span class="spinner"></span></div>
    <template v-else>
      <div v-for="cat in catalog" :key="cat.id" class="integration_section">
        <h2 class="integration_section_title"><i :class="'ti ' + cat.icon"></i> {{ cat.displayLabel }}</h2>
        <div class="integration_grid">
          <div v-for="integ in cat.integrations" :key="integ.id" class="integration_card" :class="{ 'integration_card_on': integStore.isConnected(integ.id) }">
            <div class="integration_card_top">
              <div class="integration_icon" :style="{ background: integ.color + '12', color: integ.color }">
                <i :class="'ti ' + integ.icon"></i>
              </div>
              <div class="integration_card_info">
                <div class="integration_name_row">
                  <h3>{{ integ.name }}</h3>
                  <span v-if="integStore.isConnected(integ.id)" class="integration_tag integration_tag_ok">{{ t('integ_connected') }}</span>
                  <span v-else class="integration_tag integration_tag_plan">{{ planLabel(integ.plan) }}</span>
                </div>
                <p class="integration_description">{{ integ.label[locale] || integ.label.fr }}</p>
              </div>
            </div>
            <div class="integration_capabilities">
              <span v-for="cap in integ.capabilities" :key="cap" class="integration_cap">
                <i :class="'ti ' + getCapIcon(cap)"></i> {{ getCapLabel(cap) }}
              </span>
            </div>
            <div class="integration_actions">
              <template v-if="integStore.isConnected(integ.id)">
                <button class="integration_button integration_button_secondary" @click="openSetup(integ)"><i class="ti ti-settings"></i> {{ t('integ_configure') }}</button>
                <button class="integration_button integration_button_danger" @click="handleDisconnect(integ)">{{ t('integ_disconnect') }}</button>
              </template>
              <button v-else-if="!planAllows(integ.plan)" class="integration_button integration_button_upgrade" @click="$router.push({ name: 'paywall' })"><i class="ti ti-lock"></i> {{ t('integ_upgrade') }}</button>
              <button v-else class="integration_button integration_button_primary" @click="openSetup(integ)"><i class="ti ti-plug"></i> {{ t('integ_connect') }}</button>
            </div>
          </div>
        </div>
      </div>
    </template>

    <div v-if="setupModal" class="integration_overlay" @click.self="closeModal">
      <div class="integration_modal">
        <div class="integration_modal_header">
          <div class="integration_modal_title">
            <div class="integration_icon integration_icon_small" :style="{ background: setupModal.color + '12', color: setupModal.color }">
              <i :class="'ti ' + setupModal.icon"></i>
            </div>
            <h3>{{ setupModal.name }}</h3>
          </div>
          <button class="integration_modal_close" @click="closeModal"><i class="ti ti-x"></i></button>
        </div>
        <div class="integration_modal_body">
          <div v-if="setupModal.setupSteps" class="integration_steps">
            <p class="integration_steps_title">{{ t('integ_setup_steps') }}</p>
            <pre class="integration_steps_content">{{ setupModal.setupSteps[locale] || setupModal.setupSteps.fr }}</pre>
            <a v-if="setupModal.helpUrl" :href="setupModal.helpUrl" target="_blank" rel="noopener" class="integration_help_link">
              {{ t('integ_help_link') }} <i class="ti ti-external-link"></i>
            </a>
          </div>
          <div v-for="field in setupModal.fields" :key="field.key" class="integration_field">
            <label class="integration_label">{{ field.label[locale] || field.label.fr }}</label>
            <input v-model="fieldValues[field.key]" :type="field.type || 'text'" :placeholder="field.placeholder || ''" class="integration_input" />
          </div>
          <p v-if="saveError" class="integration_message integration_message_error">{{ t('integ_save_error') }}</p>
          <p v-if="saveSuccess" class="integration_message integration_message_ok">{{ t('integ_save_success') }}</p>
        </div>
        <div class="integration_modal_footer">
          <button class="integration_button integration_button_primary" :disabled="saving || !allFieldsFilled" @click="handleSave">
            {{ saving ? t('integ_saving') : (integStore.isConnected(setupModal.id) ? t('integ_update') : t('integ_connect')) }}
          </button>
          <button class="integration_button integration_button_ghost" @click="closeModal">{{ t('integ_cancel') }}</button>
        </div>
      </div>
    </div>
    <!-- NO-CONFIRM: product modal (ConfirmDialog), never a native confirm() -->
    <ConfirmDialog v-if="toDisconnect" :title="t('integ_disconnect_title')" :body="t('integ_disconnect_confirm', { name: toDisconnect.name })" :cta="t('integ_disconnect')" :busy="disconnecting" @confirm="doDisconnect" @cancel="toDisconnect = null" />
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useAuthStore } from '@/stores/auth'
import { useIntegrationStore } from '@/stores/integrations'
import { getCapabilityInfo } from '@/config/integrations'
import '@/assets/integrations.css'
import ConfirmDialog from '@/components/ConfirmDialog.vue'

const { t, locale } = useI18n({ useScope: 'global' })
const auth = useAuthStore()
const integStore = useIntegrationStore()

const loading = ref(true)
const setupModal = ref(null)
const fieldValues = ref({})
const saving = ref(false)
const saveError = ref(false)
const saveSuccess = ref(false)

const catalog = computed(() => integStore.getCatalog(locale.value))

const PLAN_ORDER = { starter: 0, growth: 1, elite: 2, enterprise: 3 }

function planAllows(requiredPlan) {
  return (PLAN_ORDER[auth.currentPlan] ?? -1) >= (PLAN_ORDER[requiredPlan] ?? 0)
}

function planLabel(plan) {
  const labels = { starter: 'Starter+', growth: 'Growth+', elite: 'Elite+' }
  return labels[plan] || plan
}

function getCapLabel(capId) { return getCapabilityInfo(capId, locale.value).label }
function getCapIcon(capId) { return getCapabilityInfo(capId, locale.value).icon }

const allFieldsFilled = computed(() => {
  if (!setupModal.value?.fields) return false
  return setupModal.value.fields.every(f => (fieldValues.value[f.key] || '').trim().length > 0)
})

function openSetup(integ) {
  setupModal.value = integ
  saveError.value = false
  saveSuccess.value = false
  // CR-8 (E-09, D6 approved): the secrets no longer travel back down to the client —
  // no prefill, full re-entry on modification ("Connected" badge still visible)
  const vals = {}
  for (const f of integ.fields) {
    vals[f.key] = ''
  }
  fieldValues.value = vals
}

function closeModal() {
  setupModal.value = null
  fieldValues.value = {}
  saveError.value = false
  saveSuccess.value = false
}

async function handleSave() {
  saving.value = true
  saveError.value = false
  saveSuccess.value = false
  try {
    const config = { ...fieldValues.value }
    if (integStore.isConnected(setupModal.value.id)) {
      await integStore.saveConfig(setupModal.value.id, config)
    } else {
      await integStore.connectWebhook(setupModal.value.id, config)
    }
    saveSuccess.value = true
    await integStore.loadConnections()
    setTimeout(() => closeModal(), 600)
  } catch (err) {
    saveError.value = true
  } finally {
    saving.value = false
  }
}

// NO-CONFIRM: the confirmation goes through ConfirmDialog.
const toDisconnect = ref(null)
const disconnecting = ref(false)
function handleDisconnect(integ) { toDisconnect.value = integ }
async function doDisconnect() {
  if (!toDisconnect.value || disconnecting.value) return
  disconnecting.value = true
  try {
    await integStore.disconnect(toDisconnect.value.id)
    await integStore.loadConnections()
  } catch (err) {
    console.error('[integrations] disconnect error:', err && err.message)
  } finally { disconnecting.value = false; toDisconnect.value = null }
}

onMounted(async () => {
  try {
    await integStore.loadConnections()
  } catch (err) {
    /* silent */
  } finally {
    loading.value = false
  }
})
</script>

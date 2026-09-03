<template>
  <div class="integrations-page">
    <header class="ig-header">
      <h1>{{ t('integ_title') }}</h1>
      <p class="ig-sub">{{ t('integ_subtitle') }}</p>
    </header>
    <div v-if="loading" class="ig-loading"><span class="spinner"></span></div>
    <template v-else>
      <div v-for="cat in catalog" :key="cat.id" class="ig-section">
        <h2 class="ig-section-title"><i :class="'ti ' + cat.icon"></i> {{ cat.displayLabel }}</h2>
        <div class="ig-grid">
          <div v-for="integ in cat.integrations" :key="integ.id" class="ig-card" :class="{ 'ig-card-on': integStore.isConnected(integ.id) }">
            <div class="ig-card-top">
              <div class="ig-icon" :style="{ background: integ.color + '12', color: integ.color }">
                <i :class="'ti ' + integ.icon"></i>
              </div>
              <div class="ig-card-info">
                <div class="ig-name-row">
                  <h3>{{ integ.name }}</h3>
                  <span v-if="integStore.isConnected(integ.id)" class="ig-tag ig-tag-ok">{{ t('integ_connected') }}</span>
                  <span v-else class="ig-tag ig-tag-plan">{{ planLabel(integ.plan) }}</span>
                </div>
                <p class="ig-desc">{{ integ.label[locale] || integ.label.fr }}</p>
              </div>
            </div>
            <div class="ig-caps">
              <span v-for="cap in integ.capabilities" :key="cap" class="ig-cap">
                <i :class="'ti ' + getCapIcon(cap)"></i> {{ getCapLabel(cap) }}
              </span>
            </div>
            <div class="ig-actions">
              <template v-if="integStore.isConnected(integ.id)">
                <button class="ig-btn ig-btn-secondary" @click="openSetup(integ)"><i class="ti ti-settings"></i> {{ t('integ_configure') }}</button>
                <button class="ig-btn ig-btn-danger" @click="handleDisconnect(integ)">{{ t('integ_disconnect') }}</button>
              </template>
              <button v-else-if="!planAllows(integ.plan)" class="ig-btn ig-btn-upgrade" @click="$router.push({ name: 'paywall' })"><i class="ti ti-lock"></i> {{ t('integ_upgrade') }}</button>
              <button v-else class="ig-btn ig-btn-primary" @click="openSetup(integ)"><i class="ti ti-plug"></i> {{ t('integ_connect') }}</button>
            </div>
          </div>
        </div>
      </div>
    </template>

    <div v-if="setupModal" class="ig-overlay" @click.self="closeModal">
      <div class="ig-modal">
        <div class="ig-modal-header">
          <div class="ig-modal-title">
            <div class="ig-icon ig-icon-sm" :style="{ background: setupModal.color + '12', color: setupModal.color }">
              <i :class="'ti ' + setupModal.icon"></i>
            </div>
            <h3>{{ setupModal.name }}</h3>
          </div>
          <button class="ig-modal-close" @click="closeModal"><i class="ti ti-x"></i></button>
        </div>
        <div class="ig-modal-body">
          <div v-if="setupModal.setupSteps" class="ig-steps">
            <p class="ig-steps-title">{{ t('integ_setup_steps') }}</p>
            <pre class="ig-steps-content">{{ setupModal.setupSteps[locale] || setupModal.setupSteps.fr }}</pre>
            <a v-if="setupModal.helpUrl" :href="setupModal.helpUrl" target="_blank" rel="noopener" class="ig-help-link">
              {{ t('integ_help_link') }} <i class="ti ti-external-link"></i>
            </a>
          </div>
          <div v-for="field in setupModal.fields" :key="field.key" class="ig-field">
            <label class="ig-label">{{ field.label[locale] || field.label.fr }}</label>
            <input v-model="fieldValues[field.key]" :type="field.type || 'text'" :placeholder="field.placeholder || ''" class="ig-input" />
          </div>
          <p v-if="saveError" class="ig-msg ig-msg-error">{{ t('integ_save_error') }}</p>
          <p v-if="saveSuccess" class="ig-msg ig-msg-ok">{{ t('integ_save_success') }}</p>
        </div>
        <div class="ig-modal-footer">
          <button class="ig-btn ig-btn-primary" :disabled="saving || !allFieldsFilled" @click="handleSave">
            {{ saving ? t('integ_saving') : (integStore.isConnected(setupModal.id) ? t('integ_update') : t('integ_connect')) }}
          </button>
          <button class="ig-btn ig-btn-ghost" @click="closeModal">{{ t('integ_cancel') }}</button>
        </div>
      </div>
    </div>
    <!-- NO-CONFIRM : modale du produit (ConfirmDialog), jamais confirm() natif -->
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
  // CR-8 (E-09, D6 validé) : les secrets ne redescendent plus au client —
  // aucun préremplissage, resaisie complète à la modification (badge « Connecté » visible)
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

// NO-CONFIRM : la confirmation passe par ConfirmDialog.
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

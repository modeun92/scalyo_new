<template>
  <div class="settings_view">
    <div class="settings_view_header">
      <h1>⚙️ {{ t('stg_title') }}</h1>
      <p class="settings_view_sub">{{ t('stg_subtitle') }}</p>
    </div>

    <!-- Tabs -->
    <div class="settings_view_tabs">
      <button
        v-for="tab in tabs"
        :key="tab.key"
        class="settings_view_tab"
        :class="{ active: activeTab === tab.key, danger: tab.danger }"
        @click="activeTab = tab.key"
      >
        {{ t(tab.label) }}
      </button>
    </div>

    <!-- Profile -->
    <SettingsProfile
      v-if="activeTab === 'profile'"
      :local-profile="profile"
      :local-pwd="pwd"
      :profile-saving="profileSaving"
      :profile-saved="profileSaved"
      :profile-error="profileError"
      :pwd-saving="pwdSaving"
      :pwd-saved="pwdSaved"
      :pwd-error-key="pwdErrorKey"
      @save="saveProfile"
      @change-pwd="changePassword"
    />

    <!-- Team -->
    <SettingsTeam v-else-if="activeTab === 'team'" />

    <!-- Billing -->
    <SettingsBilling v-else-if="activeTab === 'billing'" />

    <!-- Integrations -->
    <SettingsIntegrations v-else-if="activeTab === 'integrations'" />

    <!-- Preferences (Language + Theme) -->
    <SettingsPreferences v-else-if="activeTab === 'appearance'" />

    <!-- Notifications -->
    <div v-else-if="activeTab === 'notifications'" class="settings_view_panel">
      <div class="settings_view_section">
        <h3>{{ t('stg_tab_notif') }}</h3>
        <div class="notification_settings">
          <label class="ns_row">
            <input type="checkbox" v-model="notif.churn" />
            {{ t('stg_notif_churn') }}
          </label>
          <label class="ns_row">
            <input type="checkbox" v-model="notif.renewal" />
            {{ t('stg_notif_renewal') }}
          </label>
          <label class="ns_row">
            <input type="checkbox" v-model="notif.burnout" />
            {{ t('stg_notif_burnout') }}
          </label>
          <label class="ns_row">
            <input type="checkbox" v-model="notif.late_tasks" />
            {{ t('stg_notif_late_tasks') }}
          </label>
          <label class="ns_row">
            <input type="checkbox" v-model="notif.nps" />
            {{ t('stg_notif_nps') }}
          </label>
        </div>
      </div>
    </div>

    <!-- Data & Account Deletion -->
    <div v-else-if="activeTab === 'delete'" class="settings_view_panel">
      <!-- Export Data (RGPD Art. 20) -->
      <div class="settings_view_section">
        <h3>{{ t('stg_export_title') }}</h3>
        <p class="settings_view_description">{{ t('stg_export_desc') }}</p>
        <button
          class="settings_view_button_secondary"
          :disabled="exportLoading"
          @click="handleExport"
        >
          {{ exportLoading ? t('stg_export_loading') : t('stg_export_btn') }}
        </button>
        <p v-if="exportError" class="settings_view_field_error">{{ t('stg_export_error') }}</p>
        <p v-if="exportSuccess" class="settings_view_field_success">{{ t('stg_export_success') }}</p>
      </div>

      <!-- Delete Account (RGPD Art. 17) -->
      <div class="settings_view_section danger_section">
        <h3>{{ t('stg_delete_title') }}</h3>
        <p>{{ t('stg_delete_warning') }}</p>
        <div v-if="!deleteConfirmStep" class="delete_action">
          <button class="button_danger" @click="deleteConfirmStep = true">
            {{ t('stg_delete_btn') }}
          </button>
        </div>
        <div v-else class="delete_confirm">
          <p class="delete_confirm_message">{{ t('stg_delete_confirm_msg') }}</p>
          <input
            v-model="deleteEmail"
            type="email"
            :placeholder="auth.user?.email"
            class="settings_view_input"
          />
          <div class="delete_confirm_actions">
            <button
              class="button_danger"
              :disabled="deleteEmail !== auth.user?.email || deleteLoading"
              @click="handleDelete"
            >
              {{ deleteLoading ? t('stg_delete_loading') : t('stg_delete_confirm_btn') }}
            </button>
            <button class="settings_view_button_ghost" @click="cancelDelete">
              {{ t('stg_delete_cancel') }}
            </button>
          </div>
          <p v-if="deleteError" class="settings_view_field_error">{{ t('stg_delete_error') }}</p>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { supabase } from '@/lib/supabase'
import SettingsProfile from '@/components/settings/SettingsProfile.vue'
import SettingsTeam from '@/components/settings/SettingsTeam.vue'
import SettingsBilling from '@/components/settings/SettingsBilling.vue'
import SettingsIntegrations from '@/components/settings/SettingsIntegrations.vue'
import SettingsPreferences from '@/components/settings/SettingsPreferences.vue'
import '@/assets/settings.css'

const { t } = useI18n({ useScope: 'global' })
const router = useRouter()
const auth = useAuthStore()

const activeTab = ref('profile')

const tabs = [
  { key: 'profile', label: 'stg_tab_profile' },
  { key: 'team', label: 'stg_tab_team' },
  { key: 'billing', label: 'stg_tab_billing' },
  { key: 'integrations', label: 'stg_tab_integrations' },
  { key: 'notifications', label: 'stg_tab_notif' },
  { key: 'appearance', label: 'stg_tab_appearance' },
  { key: 'delete', label: 'stg_tab_delete', danger: true }
]

// E-04: init from the REAL profile (the old code read auth.user?.displayName,
// a property that does not exist on the GoTrue User object → the field was always empty).
// One-off sync at the first available profile (direct boot on /app/settings: fetchProfile
// may arrive after setup) — explicit flag, never a stop() inside its own immediate
// callback (watch-once trap, B-10 family).
const profile = reactive({
  firstName: '',
  lastName: '',
  email: auth.user?.email || '',
  company: ''
})
let profileSynced = false
watch(() => auth.profile, (p) => {
  if (!p || profileSynced) return
  profileSynced = true
  profile.firstName = p.first_name || ''
  profile.lastName = p.last_name || ''
  profile.email = auth.user?.email || profile.email
  profile.company = p.company_name || ''
}, { immediate: true })

const pwd = reactive({ current: '', newPwd: '', confirm: '' })

const notif = reactive({
  churn: true,
  renewal: true,
  burnout: true,
  late_tasks: true,
  nps: false
})

// --- Export data (RGPD Art. 20) ---
const exportLoading = ref(false)
const exportError = ref(false)
const exportSuccess = ref(false)

async function handleExport() {
  exportLoading.value = true
  exportError.value = false
  exportSuccess.value = false
  try {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) throw new Error('No session')
    const resp = await fetch('/api/export', {
      headers: { 'Authorization': `Bearer ${session.access_token}` }
    })
    if (!resp.ok) throw new Error('Export failed')
    const blob = await resp.blob()
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `scalyo-export-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
    exportSuccess.value = true
  } catch (e) {
    exportError.value = true
  } finally {
    exportLoading.value = false
  }
}

// --- Delete account (RGPD Art. 17) ---
const deleteConfirmStep = ref(false)
const deleteEmail = ref('')
const deleteLoading = ref(false)
const deleteError = ref(false)

async function handleDelete() {
  if (deleteEmail.value !== auth.user?.email) return
  deleteLoading.value = true
  deleteError.value = false
  try {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) throw new Error('No session')
    const resp = await fetch('/api/users/me', {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${session.access_token}` }
    })
    if (!resp.ok) throw new Error('Delete failed')
    await auth.logout?.()
    router.push('/login')
  } catch (e) {
    deleteError.value = true
    deleteLoading.value = false
  }
}

function cancelDelete() {
  deleteConfirmStep.value = false
  deleteEmail.value = ''
  deleteError.value = false
}

// --- E-04: real profile save (D-15 pattern: a truthful ✓, otherwise revert + error) ---
const profileSaving = ref(false)
const profileSaved = ref(false)
const profileError = ref(false)

async function saveProfile() {
  if (profileSaving.value) return
  profileSaving.value = true
  profileSaved.value = false
  profileError.value = false
  const res = await auth.saveProfile({
    first_name: profile.firstName,
    last_name: profile.lastName,
    company_name: profile.company
  })
  profileSaving.value = false
  if (res && res.success) {
    profileSaved.value = true
    setTimeout(() => { profileSaved.value = false }, 2500)
  } else {
    // A write failure = never a false success — revert from the store (unchanged) + visible error
    const p = auth.profile
    if (p) {
      profile.firstName = p.first_name || ''
      profile.lastName = p.last_name || ''
      profile.company = p.company_name || ''
    }
    profileError.value = true
    setTimeout(() => { profileError.value = false }, 4000)
  }
}

// --- E-04: password change (truthful errors by real cause) ---
const pwdSaving = ref(false)
const pwdSaved = ref(false)
const pwdErrorKey = ref('')

async function changePassword() {
  if (pwdSaving.value) return
  pwdSaving.value = true
  pwdSaved.value = false
  pwdErrorKey.value = ''
  const res = await auth.changePassword(pwd.current, pwd.newPwd)
  pwdSaving.value = false
  if (res && res.success) {
    pwdSaved.value = true
    pwd.current = ''
    pwd.newPwd = ''
    pwd.confirm = ''
    setTimeout(() => { pwdSaved.value = false }, 4000)
  } else {
    const map = {
      wrong_current: 'stg_pwd_err_current',
      same_password: 'stg_pwd_err_same',
      rate_limit: 'reset_err_rate_limit'
    }
    pwdErrorKey.value = map[res && res.error] || 'stg_pwd_err_generic'
  }
}
</script>

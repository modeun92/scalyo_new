<template>
  <div class="settings_view_panel">
    <!-- Email Config Section -->
    <div class="settings_view_section">
      <h3>{{ t('integration_resend_title') }}</h3>
      <p class="email_integration_description">{{ t('integration_resend_description') }}</p>

      <!-- Status badge -->
      <div class="email_integration_status_bar">
        <span class="email_integration_logo">📧</span>
        <strong>Resend</strong>
        <span :class="['email_integration_badge', isConfigured ? 'email_integration_active' : '']">
          {{ isConfigured ? t('integration_resend_active') : t('integration_resend_inactive') }}
        </span>
      </div>

      <!-- RESEND-STATE (27/08): a member sees the org's real status (same source as
           Email Studio) but not the configuration — the server already refuses it (403 not_org_owner) -->
      <p v-if="!canManage" class="email_integration_description">{{ t('integration_resend_managed_by_owner') }}</p>

      <!-- Setup Guide (shown when not configured) -->
      <div v-if="canManage && !isConfigured" class="email_integration_guide">
        <div v-for="(step, i) in steps" :key="i" class="email_integration_step">
          <div class="email_integration_step_number">{{ i + 1 }}</div>
          <div>
            <strong>{{ step.title }}</strong>
            <p>{{ step.desc }}</p>
            <a v-if="step.link" :href="step.link" target="_blank" rel="noopener" class="email_integration_link">
              {{ step.linkLabel }} →
            </a>
          </div>
        </div>
      </div>

      <!-- Config Form -->
      <div v-if="canManage" class="email_integration_form">
        <div class="email_integration_field">
          <label>{{ t('integration_resend_key_label') }}</label>
          <input v-model="form.key" type="password" :placeholder="isConfigured ? '••••••••••••' : t('integration_resend_key_placeholder')" class="field_input" autocomplete="off" />
        </div>
        <div class="email_integration_row">
          <div class="email_integration_field">
            <label>{{ t('integration_resend_domain_label') }}</label>
            <input v-model="form.domain" type="text" :placeholder="t('integration_resend_domain_placeholder')" class="field_input" />
          </div>
          <div class="email_integration_field">
            <label>{{ t('integration_resend_sender_label') }}</label>
            <input v-model="form.sender" type="text" :placeholder="t('integration_resend_sender_placeholder')" class="field_input" />
          </div>
        </div>

        <div v-if="error" class="email_integration_error">{{ error }}</div>
        <div v-if="success" class="email_integration_success">{{ success }}</div>

        <div class="email_integration_actions">
          <button class="button_secondary" @click="testConnection" :disabled="testing || (!form.key && !isConfigured)">
            {{ testing ? '...' : t('integration_resend_test') }}
          </button>
          <button class="button_save" @click="saveConfig" :disabled="saving || (!form.key && !isConfigured)">
            {{ saving ? '...' : t('integration_resend_save') }}
          </button>
        </div>
      </div>

      <!-- Privacy note -->
      <div v-if="canManage" class="email_integration_privacy">
        <span>🔒</span>
        <span>{{ t('integration_resend_privacy') }}</span>
      </div>
    </div>

    <!-- Team Permissions (shown when configured) -->
    <div v-if="canManage && isConfigured && teamMembers.length" class="settings_view_section">
      <h3>{{ t('integration_resend_perm_title') }}</h3>
      <p class="email_integration_description">{{ t('integration_resend_perm_description') }}</p>
      <div class="email_integration_members">
        <div v-for="m in teamMembers" :key="m.id" class="email_integration_member">
          <div class="email_integration_member_info">
            <strong>{{ m.name }}</strong>
            <span class="email_integration_member_email">{{ m.email }}</span>
          </div>
          <label class="email_integration_toggle">
            <input type="checkbox" :checked="m.canSendEmail" @change="togglePermission(m)" />
            <span class="email_integration_toggle_slider"></span>
          </label>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useTeamStore } from '@/stores/team'
import { useAuthStore } from '@/stores/auth'
import { supabase } from '@/lib/supabase'

const { t } = useI18n({ useScope: 'global' })
const team = useTeamStore()
const auth = useAuthStore()
// Mirror of the server-side assertCanManage (contract CR-8 D2): org owner, or account without an org
const canManage = computed(() => auth.isOrgOwner || !auth.profile?.organization_id)

// I18N-INLINE (04/09): this panel used to carry its OWN translations = { fr, en, ko } table
// (28 keys x 3) with its own L() resolver AND its own locale, read from
// localStorage['scalyo_lang'] - a key NOTHING in the code base writes (every other reader uses
// 'scalyo_locale'). The read therefore always returned null and the panel fell back to
// navigator.language: changing the language in Settings > Preferences moved every panel EXCEPT
// this one. The strings are integration_resend_* in i18n now, and t() follows the application locale.

const steps = computed(() => [
  { title: t('integration_resend_step1_title'), desc: t('integration_resend_step1_description'), link: 'https://resend.com/signup', linkLabel: 'resend.com' },
  { title: t('integration_resend_step2_title'), desc: t('integration_resend_step2_description'), link: 'https://resend.com/domains', linkLabel: 'resend.com/domains' },
  { title: t('integration_resend_step3_title'), desc: t('integration_resend_step3_description'), link: 'https://resend.com/api-keys', linkLabel: 'resend.com/api-keys' },
  { title: t('integration_resend_step4_title'), desc: t('integration_resend_step4_description') },
])

// ─── State ────────────────────────────────────────────────────
const form = ref({ key: '', domain: '', sender: '' })
const saving = ref(false)
const testing = ref(false)
const error = ref('')
const success = ref('')
const isConfigured = ref(false)

const teamMembers = computed(() => team.members.map(m => ({
  ...m,
  canSendEmail: m.canSendEmail || false,
})))

// ─── API helper — CR-8 (E-08): the key only travels to /api/*, never
// to Supabase nor to api.resend.com from the browser. It is never read back.
async function apiFetch(path, options = {}) {
  const token = (await supabase.auth.getSession()).data.session?.access_token
  return fetch(path, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + token,
      ...(options.headers || {}),
    },
  })
}

// ─── Load existing config (statut + champs non sensibles uniquement) ──────────
onMounted(async () => {
  await team.loadMembers()
  // RESEND-STATE (27/08): ONE status source for every role — the same RPC
  // as the Email Studio banner (get_org_email_status, org-wide, boolean + non-sensitive
  // fields). The old GET /api/email/config answered 403 to a member and the
  // component displayed "Not configured" even though the org was connected.
  try {
    const { data, error } = await supabase.rpc('get_org_email_status')
    if (error) throw error
    const row = Array.isArray(data) ? data[0] : data
    isConfigured.value = !!row?.configured
    form.value.domain = row?.sender_domain || ''
    form.value.sender = row?.sender_name || ''
  } catch { /* status unavailable → not configured, never an invented state */ }
})

// ─── Save ─────────────────────────────────────────────────────
async function saveConfig() {
  saving.value = true
  error.value = ''
  success.value = ''
  try {
    form.value.key = form.value.key.trim()
    if (form.value.key && !form.value.key.startsWith('re_')) {
      error.value = t('integration_resend_invalid_key')
      return
    }
    const r = await apiFetch('/api/email/config', {
      method: 'POST',
      body: JSON.stringify({
        api_key: form.value.key || undefined,
        sender_domain: form.value.domain || '',
        sender_name: form.value.sender || '',
      }),
    })
    if (!r.ok) {
      const data = await r.json().catch(() => ({}))
      throw new Error(data.error || t('integration_resend_test_fail'))
    }
    isConfigured.value = true
    form.value.key = ''
    success.value = t('integration_resend_saved')
    setTimeout(() => { success.value = '' }, 3000)
  } catch (e) { error.value = e.message }
  finally { saving.value = false }
}

// ─── Test connection (server-side — the key never leaves towards a third party) ─────
async function testConnection() {
  testing.value = true
  error.value = ''
  success.value = ''
  try {
    const r = await apiFetch('/api/email/test', {
      method: 'POST',
      body: JSON.stringify(form.value.key ? { api_key: form.value.key.trim() } : {}),
    })
    const data = await r.json().catch(() => ({}))
    if (r.ok && data.valid) { success.value = t('integration_resend_test_ok') }
    else { error.value = t('integration_resend_test_fail') }
    setTimeout(() => { success.value = ''; error.value = '' }, 4000)
  } catch { error.value = t('integration_resend_test_fail') }
  finally { testing.value = false }
}

// ─── Toggle team permission ───────────────────────────────────
async function togglePermission(member) {
  const newVal = !member.canSendEmail
  await supabase.from('organization_members')
    .update({ can_send_email: newVal })
    .eq('user_id', member.id)
  const idx = team.members.findIndex(m => m.id === member.id)
  if (idx > -1) team.members[idx].canSendEmail = newVal
}
</script>

<style scoped>
.email_integration_description { color: var(--text-secondary); margin-bottom: 1.25rem; font-size: 0.9rem; }
.email_integration_status_bar { display: flex; align-items: center; gap: 0.75rem; padding: 0.75rem 1rem; background: var(--bg-secondary, #f8f9fa); border-radius: 12px; margin-bottom: 1.25rem; }
.email_integration_logo { font-size: 1.5rem; }
.email_integration_badge { font-size: 0.75rem; padding: 2px 10px; border-radius: 999px; background: var(--bg-tertiary, #e5e7eb); color: var(--text-secondary); }
.email_integration_badge.email_integration_active { background: #dcfce7; color: #166534; }

.email_integration_guide { display: flex; flex-direction: column; gap: 1rem; margin-bottom: 1.5rem; padding: 1.25rem; background: var(--bg-secondary, #f8f9fa); border-radius: 16px; }
.email_integration_step { display: flex; gap: 1rem; align-items: flex-start; }
.email_integration_step_number { min-width: 28px; height: 28px; display: flex; align-items: center; justify-content: center; border-radius: 50%; background: var(--primary, #6366f1); color: white; font-size: 0.8rem; font-weight: 600; }
.email_integration_step p { margin: 0.25rem 0 0; font-size: 0.85rem; color: var(--text-secondary); }
.email_integration_link { font-size: 0.85rem; color: var(--primary, #6366f1); text-decoration: none; }

.email_integration_form { display: flex; flex-direction: column; gap: 1rem; }
.email_integration_row { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; }
.email_integration_field label { display: block; font-size: 0.8rem; font-weight: 500; margin-bottom: 0.35rem; color: var(--text-secondary); }
.email_integration_actions { display: flex; gap: 0.75rem; justify-content: flex-end; }
.button_secondary { padding: 0.5rem 1.25rem; border-radius: 10px; border: 1px solid var(--border, #d1d5db); background: transparent; cursor: pointer; font-size: 0.85rem; }
.button_save { padding: 0.5rem 1.25rem; border-radius: 10px; border: none; background: var(--primary, #6366f1); color: white; cursor: pointer; font-size: 0.85rem; }
.button_save:disabled, .button_secondary:disabled { opacity: 0.5; cursor: default; }

.email_integration_error { color: #dc2626; font-size: 0.85rem; }
.email_integration_success { color: #16a34a; font-size: 0.85rem; }

.email_integration_privacy { display: flex; gap: 0.5rem; align-items: flex-start; padding: 0.75rem 1rem; background: var(--bg-secondary, #f0f4ff); border-radius: 12px; margin-top: 1rem; font-size: 0.8rem; color: var(--text-secondary); }

.email_integration_members { display: flex; flex-direction: column; gap: 0.5rem; }
.email_integration_member { display: flex; align-items: center; justify-content: space-between; padding: 0.75rem 1rem; background: var(--bg-secondary, #f8f9fa); border-radius: 12px; }
.email_integration_member_info { display: flex; flex-direction: column; }
.email_integration_member_email { font-size: 0.8rem; color: var(--text-secondary); }

.email_integration_toggle { position: relative; display: inline-block; width: 44px; height: 24px; cursor: pointer; }
.email_integration_toggle input { opacity: 0; width: 0; height: 0; }
.email_integration_toggle_slider { position: absolute; inset: 0; background: #d1d5db; border-radius: 999px; transition: 0.2s; }
.email_integration_toggle_slider::before { content: ''; position: absolute; height: 18px; width: 18px; left: 3px; bottom: 3px; background-color: var(--bg-card); border-radius: 50%; transition: 0.2s; }
.email_integration_toggle input:checked + .email_integration_toggle_slider { background: var(--primary, #6366f1); }
.email_integration_toggle input:checked + .email_integration_toggle_slider::before { transform: translateX(20px); }

@media (max-width: 640px) { .email_integration_row { grid-template-columns: 1fr; } }
</style>
<template>
  <div class="auth_page">
    <div class="auth_card">
      <div class="auth_logo">
        <ScalyoLogo :size="48" /><span class="auth_brand">Scalyo</span>
      </div>

      <div v-if="loading" class="join_loading"><span class="spinner" /> {{ t('join_verifying') }}</div>

      <div v-else-if="error" class="auth_error">{{ error }}</div>

      <template v-else-if="invitation">
        <!-- Succes -->
        <div v-if="accepted" class="success_header">
          <div class="success_icon">✅</div>
          <h1>{{ t('join_success_title') }}</h1>
          <p class="auth_sub">{{ alreadyMember ? t('join_already_member') : t('join_success_subtitle') }}</p>
          <router-link v-if="isAuthenticated" to="/app/dashboard" class="button_primary full" style="margin-top:20px;text-decoration:none">{{ t('join_go_dashboard') }}</router-link>
          <router-link v-else to="/login" class="button_primary full" style="margin-top:20px;text-decoration:none">{{ t('login_submit') }}</router-link>
        </div>

        <!-- Email confirmation after sign-up -->
        <div v-else-if="confirmationRequired" class="confirm_header">
          <div class="success_icon">📧</div>
          <h1>{{ t('join_confirm_title') }}</h1>
          <p class="auth_sub">{{ t('join_confirm_email') }}</p>
          <router-link to="/login" class="button_primary full" style="margin-top:20px;text-decoration:none">{{ t('login_submit') }}</router-link>
        </div>

        <!-- Typed refusals (D1① / D2① / seats / dead invitation) -->
        <div v-else-if="blocked" class="blocked_header">
          <div class="success_icon">🚫</div>
          <h1>{{ blockedTitle }}</h1>
          <p class="auth_sub">{{ blockedBody }}</p>
          <button v-if="blocked === 'email_mismatch'" class="button_primary full" @click="useAnotherAccount">{{ t('join_other_account') }}</button>
          <router-link v-else-if="isAuthenticated" to="/app/dashboard" class="button_secondary full" style="text-decoration:none">{{ t('join_go_dashboard') }}</router-link>
        </div>

        <!-- State (iii): already logged in → confirmation card, one explicit click -->
        <template v-else-if="isAuthenticated">
          <h1>{{ t('join_title') }}</h1>
          <div class="join_info">
            <p class="join_org">{{ invitation.organization }}</p>
            <p class="join_role">{{ roleLabel }}</p>
          </div>
          <p class="auth_sub">{{ t('join_logged_as', { email: currentEmail }) }}</p>

          <div v-if="registerError" class="auth_error">{{ registerError }}</div>

          <button class="button_primary full" :disabled="joining" @click="acceptAsCurrentUser">
            <span v-if="joining" class="spinner" /><span v-else>{{ t('join_accept_cta') }}</span>
          </button>
          <button class="button_link full" @click="useAnotherAccount">{{ t('join_other_account') }}</button>
        </template>

        <!-- States (i) and (ii): logged out → sign-up, or log in if the account exists -->
        <template v-else>
          <h1>{{ t('join_title') }}</h1>
          <div class="join_info">
            <p class="join_org">{{ invitation.organization }}</p>
            <p class="join_role">{{ roleLabel }}</p>
          </div>
          <p class="auth_sub">{{ t('join_subtitle') }}</p>

          <div v-if="registerError" class="auth_error">{{ registerError }}</div>

          <form @submit.prevent="handleJoin" class="auth_form">
            <div class="field_group_row">
              <div class="field_group"><label>{{ t('register_firstname') }}</label><input v-model="firstName" type="text" required class="field_input" /></div>
              <div class="field_group"><label>{{ t('register_lastname') }}</label><input v-model="lastName" type="text" required class="field_input" /></div>
            </div>
            <div class="field_group"><label>{{ t('login_email') }}</label><input :value="invitation.email" type="email" disabled class="field_input" style="opacity:0.6" /></div>
            <div class="field_group"><label>{{ t('login_password') }}</label><input v-model="password" type="password" required class="field_input" minlength="8" :placeholder="t('register_password_ph')" /></div>
            <label class="cgu_check"><input v-model="cguAccepted" type="checkbox" class="cgu_input" /><span class="cgu_text">{{ t('register_cgu_accept') }} <router-link to="/cgu" target="_blank" class="link">{{ t('register_cgu_link') }}</router-link> {{ t('register_cgu_and') }} <router-link to="/privacy" target="_blank" class="link">{{ t('register_privacy_link') }}</router-link>{{ t('register_cgu_suffix') }}</span></label>
            <button type="submit" class="button_primary full" :disabled="joining || !cguAccepted"><span v-if="joining" class="spinner" /><span v-else>{{ t('join_submit') }}</span></button>
          </form>

          <p class="join_alternate">{{ t('join_have_account') }}
            <button class="button_link inline" @click="goLoginToAccept">{{ t('join_login_to_accept') }}</button>
          </p>
        </template>
      </template>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { supabase } from '@/lib/supabase'
import ScalyoLogo from '@/components/ScalyoLogo.vue'

const PENDING_INVITE_KEY = 'scalyo_pending_invite'

const { t, locale } = useI18n({ useScope: 'global' })
const route = useRoute()
const router = useRouter()
const authStore = useAuthStore()

const loading = ref(true)
const error = ref('')
const invitation = ref(null)
const firstName = ref('')
const lastName = ref('')
const password = ref('')
const cguAccepted = ref(false)
const joining = ref(false)
const accepted = ref(false)
const alreadyMember = ref(false)
const confirmationRequired = ref(false)
const registerError = ref('')
// 'email_mismatch' | 'already_member_other_org' | 'seat_limit_reached' | 'invitation_not_valid'
const blocked = ref('')
const blockedDetails = ref({})

const isAuthenticated = computed(() => authStore.isAuthenticated)
const currentEmail = computed(() => (authStore.user && authStore.user.email) || '')
const roleLabel = computed(() => {
  const r = invitation.value && invitation.value.role
  return r ? t('join_role_' + r) : ''
})

const blockedTitle = computed(() => {
  if (blocked.value === 'email_mismatch') return t('join_mismatch_title')
  if (blocked.value === 'already_member_other_org') return t('join_other_org_title')
  if (blocked.value === 'seat_limit_reached') return t('join_seat_limit_title')
  return t('join_not_valid_title')
})

const blockedBody = computed(() => {
  if (blocked.value === 'email_mismatch') {
    return t('join_mismatch_body', {
      invited: blockedDetails.value.invited_email || (invitation.value && invitation.value.email) || '',
      current: blockedDetails.value.current_email || currentEmail.value,
    })
  }
  if (blocked.value === 'already_member_other_org') {
    const org = blockedDetails.value.current_organization
    return org ? t('join_other_org_body', { org }) : t('join_other_org_body_noname')
  }
  if (blocked.value === 'seat_limit_reached') return t('join_seat_limit_body')
  return t('join_not_valid_body')
})

function persistPendingInvite() {
  try { localStorage.setItem(PENDING_INVITE_KEY, invitation.value.token) } catch (_) {}
}

function joinPath() {
  return '/join?token=' + encodeURIComponent((invitation.value && invitation.value.token) || route.query.token || '')
}

onMounted(async () => {
  const token = route.query.token
  if (!token) { error.value = t('join_no_token'); loading.value = false; return }
  try {
    const resp = await fetch('/api/invite/verify?token=' + encodeURIComponent(token))
    const data = await resp.json()
    if (resp.ok && data.valid) {
      invitation.value = { ...data, token }
      // The token no longer sleeps in the browser: acceptance is a click,
      // never a side effect of the next login (INVITE-ANY-USER).
      try { localStorage.removeItem(PENDING_INVITE_KEY) } catch (_) {}
      // D1① — client-side check, to DISPLAY the refusal before any call.
      // The server performs the same check: it is the authority.
      if (authStore.isAuthenticated) {
        const invited = String(data.email || '').trim().toLowerCase()
        const current = String(currentEmail.value || '').trim().toLowerCase()
        if (invited && current && invited !== current) {
          blocked.value = 'email_mismatch'
          blockedDetails.value = { invited_email: data.email, current_email: currentEmail.value }
        }
      }
    } else if (resp.status === 410) {
      error.value = t('join_expired')
    } else {
      error.value = data.error === 'invitation_not_valid' ? t('join_not_valid_body') : (t('join_invalid'))
    }
  } catch { error.value = t('join_error') }
  finally { loading.value = false }
})

function applyErrorPayload(status, data) {
  const code = (data && data.code) || ''
  if (['email_mismatch', 'already_member_other_org', 'seat_limit_reached'].includes(code)) {
    blocked.value = code
    blockedDetails.value = data || {}
    return true
  }
  if (status === 410) { registerError.value = t('join_expired'); return true }
  if (code === 'invitation_not_valid' || code === 'invitation_not_found' || status === 404) {
    blocked.value = 'invitation_not_valid'
    blockedDetails.value = data || {}
    return true
  }
  return false
}

async function postAccept(accessToken) {
  const res = await fetch('/api/invite/accept', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + accessToken },
    body: JSON.stringify({ token: invitation.value.token })
  })
  const data = await res.json().catch(() => null)
  return { res, data }
}

// State (iii) — already logged in, matching email: one click, one acceptance.
async function acceptAsCurrentUser() {
  if (joining.value) return
  registerError.value = ''
  joining.value = true
  try {
    const { data: sessData } = await supabase.auth.getSession()
    const accessToken = sessData?.session?.access_token
    if (!accessToken) { registerError.value = t('join_error'); return }
    const { res, data } = await postAccept(accessToken)
    if (res.ok) {
      alreadyMember.value = !!(data && data.already_member)
      accepted.value = true
      if (authStore.user) await authStore.fetchProfile(authStore.user.id)
      return
    }
    if (!applyErrorPayload(res.status, data)) registerError.value = t('join_error')
  } catch (e) {
    registerError.value = (e && typeof e.message === 'string' && e.message) || t('join_error')
  } finally { joining.value = false }
}

// State (ii) — logged out with an existing account: log in THEN come back
// here for an explicit click (LoginView honors ?redirect=).
function goLoginToAccept() {
  router.push('/login?redirect=' + encodeURIComponent(joinPath()))
}

// D1① exit — switch account without losing the invitation.
async function useAnotherAccount() {
  const target = joinPath()
  try { await authStore.logout() } catch (_) {}
  router.push('/login?redirect=' + encodeURIComponent(target))
}

// State (i) — sign-up from the invitation (nominal path, unchanged).
async function handleJoin() {
  if (joining.value || !cguAccepted.value) return
  registerError.value = ''
  joining.value = true
  try {
    const result = await authStore.register(invitation.value.email, password.value, firstName.value, lastName.value, locale.value)
    // G9-6: never a raw object on screen ("{}") — string message or i18n fallback
    if (!result.success) { registerError.value = (typeof result.error === 'string' && result.error) || t('join_error'); return }
    // "Email confirmation enabled" path: no immediate session. The token is
    // put back here so acceptPendingInvite activates it at the first login — which is what
    // the join_confirm_email screen promises the user.
    // Safe since Lot 6: auth.js calls /api/invite/verify and only replays the
    // token IF the targeted email is the one of the logged-in account (contract §4d, safe route).
    // The token is only set after a SUCCESSFUL sign-up on the invitation's email,
    // never on view mount: the destructive INVITE-ANY-USER path stays closed.
    if (result.needsConfirmation) { persistPendingInvite(); confirmationRequired.value = true; return }
    const { data: sessData } = await supabase.auth.getSession()
    const accessToken = sessData?.session?.access_token
    if (!accessToken) { persistPendingInvite(); confirmationRequired.value = true; return }
    const { res, data } = await postAccept(accessToken)
    if (res.ok) {
      alreadyMember.value = !!(data && data.already_member)
      accepted.value = true
      return
    }
    if (res.status === 401) { confirmationRequired.value = true; return }
    if (!applyErrorPayload(res.status, data)) registerError.value = t('join_error')
  } catch (e) { registerError.value = (e && typeof e.message === 'string' && e.message) || t('join_error') } // G9-6
  finally { joining.value = false }
}
</script>

<style scoped>
.auth_page { min-height: 100vh; display: flex; align-items: center; justify-content: center; background: linear-gradient(135deg, #f8f9fb, #ede9fe); padding: 20px; }
.auth_card { background: var(--bg-card); border-radius: 20px; padding: 48px 40px; width: 100%; max-width: 460px; box-shadow: 0 20px 60px rgba(0,0,0,0.08); }
.auth_logo { display: flex; align-items: center; gap: 10px; justify-content: center; margin-bottom: 32px; }
.auth_brand { font-size: 1.5rem; font-weight: 800; background: linear-gradient(135deg, #7c3aed, #a78bfa); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
.auth_card h1 { font-size: 1.5rem; font-weight: 800; text-align: center; margin-bottom: 6px; }
.auth_sub { font-size: 0.88rem; color: var(--text-secondary); text-align: center; margin-bottom: 28px; }
.join_loading { text-align: center; padding: 40px 0; color: var(--text-secondary); display: flex; align-items: center; justify-content: center; gap: 10px; }
.join_info { text-align: center; margin-bottom: 20px; }
.join_org { font-size: 1.1rem; font-weight: 700; color: #111827; }
.join_role { font-size: 0.82rem; color: #7c3aed; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; margin-top: 4px; }
.success_header { text-align: center; }
.confirm_header { text-align: center; }
.blocked_header { text-align: center; }
.success_icon { font-size: 2.5rem; margin-bottom: 12px; }
.auth_form { display: flex; flex-direction: column; gap: 16px; }
.field_group_row { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.field_group { display: flex; flex-direction: column; gap: 4px; }
.field_group label { font-size: 0.78rem; font-weight: 600; color: var(--text-secondary); }
.field_input { padding: 11px 14px; border: 1px solid var(--border); border-radius: 10px; font-size: 0.9rem; outline: none; transition: border-color 0.15s; }
.field_input:focus { border-color: #7c3aed; }
.cgu_check { display: flex; align-items: flex-start; gap: 8px; cursor: pointer; margin-top: 4px; }
.cgu_input { margin-top: 3px; accent-color: #7c3aed; width: 16px; height: 16px; flex-shrink: 0; }
.cgu_text { font-size: 0.78rem; color: var(--text-secondary); line-height: 1.5; }
.button_primary { background: var(--purple); color: #fff; border: none; padding: 12px; border-radius: 10px; font-size: 0.95rem; font-weight: 600; cursor: pointer; transition: all 0.2s; display: flex; align-items: center; justify-content: center; min-height: 44px; }
.button_primary:hover:not(:disabled) { background: #6d28d9; }
.button_primary:disabled { opacity: 0.5; cursor: not-allowed; }
.button_primary.full { width: 100%; }
.button_secondary { background: transparent; color: #7c3aed; border: 1px solid #ddd6fe; padding: 12px; border-radius: 10px; font-size: 0.95rem; font-weight: 600; cursor: pointer; display: flex; align-items: center; justify-content: center; min-height: 44px; }
.button_secondary.full { width: 100%; margin-top: 12px; }
.button_link { background: none; border: none; color: #7c3aed; font-weight: 600; font-size: 0.85rem; cursor: pointer; padding: 10px 0; }
.button_link.full { width: 100%; margin-top: 10px; }
.button_link.inline { padding: 0; font-size: inherit; }
.join_alternate { text-align: center; font-size: 0.82rem; color: var(--text-secondary); margin-top: 18px; }
.link { color: #7c3aed; font-weight: 600; text-decoration: none; }
.auth_error { background: #fef2f2; border: 1px solid #fecaca; color: #dc2626; border-radius: 8px; padding: 10px 14px; font-size: 0.85rem; margin-bottom: 16px; text-align: center; }
.spinner { width: 18px; height: 18px; border: 2px solid rgba(255,255,255,0.4); border-top-color: #fff; border-radius: 50%; animation: spin 0.7s linear infinite; display: inline-block; }
@keyframes spin { to { transform: rotate(360deg); } }
@media (max-width: 640px) { .auth_card { padding: 32px 20px; } .field_group_row { grid-template-columns: 1fr; } }
</style>

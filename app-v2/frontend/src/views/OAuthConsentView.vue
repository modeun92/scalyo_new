<template>
  <div class="auth_page">
    <div class="auth_card">
      <div class="auth_logo">
        <ScalyoLogo :size="48" /><span class="auth_brand">Scalyo</span>
      </div>

      <!-- Loading the authorization details -->
      <div v-if="loading" class="consent_loading">
        <span class="spinner" /> {{ t('oauth_consent_loading') }}
      </div>

      <!-- The flow cannot run. Never a silent failure on a grant screen. -->
      <div v-else-if="unavailable" class="blocked_header">
        <div class="success_icon">🚫</div>
        <h1>{{ t('oauth_consent_unavailable_title') }}</h1>
        <p class="auth_sub">{{ t('oauth_consent_unavailable_body') }}</p>
        <router-link to="/app/dashboard" class="button_secondary full" style="text-decoration:none">
          {{ t('join_go_dashboard') }}
        </router-link>
      </div>

      <div v-else-if="error" class="auth_error">{{ error }}</div>

      <!-- Denied: the user cancelled and we could not bounce them back. -->
      <div v-else-if="denied" class="blocked_header">
        <div class="success_icon">✋</div>
        <h1>{{ t('oauth_consent_denied_title') }}</h1>
        <p class="auth_sub">{{ t('oauth_consent_denied_body') }}</p>
        <router-link to="/app/dashboard" class="button_secondary full" style="text-decoration:none">
          {{ t('join_go_dashboard') }}
        </router-link>
      </div>

      <!-- Not signed in: sign in first, WITHOUT losing the authorization_id. -->
      <template v-else-if="!isAuthenticated">
        <h1>{{ t('oauth_consent_title', { client: clientLabel }) }}</h1>
        <p class="auth_sub">{{ t('oauth_consent_signin_required') }}</p>
        <router-link :to="loginTarget" class="button_primary full" style="text-decoration:none">
          {{ t('login_submit') }}
        </router-link>
      </template>

      <!-- The consent screen itself -->
      <template v-else>
        <h1>{{ t('oauth_consent_title', { client: clientLabel }) }}</h1>
        <p class="auth_sub">{{ t('oauth_consent_intro', { client: clientLabel }) }}</p>

        <p class="consent_account">{{ t('oauth_consent_logged_as', { email: currentEmail }) }}</p>

        <div class="consent_block">
          <p class="consent_block_title">{{ t('oauth_consent_can_title') }}</p>
          <ul class="consent_list consent_can">
            <li v-for="key in CAN_KEYS" :key="key">{{ t(key) }}</li>
          </ul>
        </div>

        <!--
          OAUTH-CONSENT-PROMISES (14/09/2026): the "cannot" list renders ONLY when the
          database restrictions it describes are actually deployed. Those promises are
          about the TOKEN, not about the MCP tool list — until
          20260914120000_mcp_ai_session_restrictions.sql is applied AND the access-token
          hook stamps ai_agent, the credential can still write through Supabase REST and
          the sentence would be false. A consent screen is a commitment to the user, not
          marketing copy. See docs/MCP_CONSENT_PAGE.md.
        -->
        <div v-if="showCannotList" class="consent_block">
          <p class="consent_block_title">{{ t('oauth_consent_cannot_title') }}</p>
          <ul class="consent_list consent_cannot">
            <li v-for="key in CANNOT_KEYS" :key="key">{{ t(key) }}</li>
          </ul>
        </div>

        <p class="consent_revoke">{{ t('oauth_consent_revoke_hint') }}</p>

        <div v-if="actionError" class="auth_error">{{ actionError }}</div>

        <button class="button_primary full" :disabled="working" @click="approve">
          <span v-if="working === 'approve'" class="spinner" /><span v-else>{{ t('oauth_consent_allow') }}</span>
        </button>
        <button class="button_secondary full" :disabled="working" @click="deny">
          {{ t('oauth_consent_cancel') }}
        </button>
      </template>
    </div>
  </div>
</template>

<script setup>
// Scalyo-owned OAuth consent screen for the Supabase authorization server.
//
// OAUTH-CONSENT-OWNER (14/09/2026): Supabase runs the OAuth 2.1 backend — codes, tokens,
// PKCE, dynamic client registration, revocation — but the page the user actually reads
// before granting an AI client access to their customer portfolio is Scalyo's. It has to
// be: the sentence "it cannot modify your customers" is a statement about Scalyo's data
// model, and it is not Supabase's to make.
//
// ROUTE HAS NO meta.guest AND NO meta.requiresAuth, for the same reason /join does not
// (INV-GUEST): with `guest` an already-signed-in user is bounced to the dashboard and the
// authorization_id is lost; with `requiresAuth` the guard redirects to /login by NAME,
// which drops the query string — and the authorization_id only exists in that query.
// Auth is therefore handled here, and the sign-in link carries a redirect back to this
// exact URL.

import { ref, computed, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { storeToRefs } from 'pinia'

import ScalyoLogo from '@/components/ScalyoLogo.vue'
import { useAuthStore } from '@/stores/auth'
import {
  isOAuthConsentSupported,
  getAuthorizationDetails,
  approveAuthorization,
  denyAuthorization,
} from '@/lib/oauthConsent'

const { t } = useI18n()
const route = useRoute()
const authStore = useAuthStore()
const { isAuthenticated } = storeToRefs(authStore)

// The keys are listed here rather than inlined so check-i18n.mjs sees them as literals.
const CAN_KEYS = [
  'oauth_consent_can_portfolio',
  'oauth_consent_can_health',
  'oauth_consent_can_renewals',
  'oauth_consent_can_tasks',
]
const CANNOT_KEYS = [
  'oauth_consent_cannot_modify',
  'oauth_consent_cannot_email',
  'oauth_consent_cannot_notes',
  'oauth_consent_cannot_billing',
]

/**
 * Flipped to true only once the token-level restrictions are live in production.
 * Kept as an explicit constant rather than an env var so that turning the promises on is
 * a reviewed code change with this comment attached to it.
 */
const RESTRICTIONS_DEPLOYED = false

const loading = ref(true)
const unavailable = ref(false)
const error = ref('')
const actionError = ref('')
const denied = ref(false)
const working = ref('')
const details = ref(null)

const authorizationId = computed(
  () => route.query.authorization_id || route.query.authorizationId || ''
)

const currentEmail = computed(() => authStore.user?.email || '')
const showCannotList = computed(() => RESTRICTIONS_DEPLOYED)

// R21: no invented name. An unidentified client is described as unidentified, because
// "an application is requesting access to your customers" is safer than a made-up name.
const clientLabel = computed(() => details.value?.clientName || t('oauth_consent_unknown_client'))

/** Back to this exact URL, query included, after signing in. */
const loginTarget = computed(() => ({ path: '/login', query: { redirect: route.fullPath } }))

onMounted(async () => {
  try {
    if (!authorizationId.value) {
      error.value = t('oauth_consent_missing_id')
      return
    }
    if (!isOAuthConsentSupported()) {
      unavailable.value = true
      return
    }
    // Details are readable only for a signed-in user; the sign-in branch renders first.
    if (!isAuthenticated.value) return

    details.value = await getAuthorizationDetails(authorizationId.value)
  } catch (e) {
    console.error('OAuth consent details failed:', e?.message || e)
    error.value = t('oauth_consent_error')
  } finally {
    loading.value = false
  }
})

async function approve() {
  actionError.value = ''
  working.value = 'approve'
  try {
    const url = await approveAuthorization(authorizationId.value)
    // Full navigation, not router.push: the target belongs to Supabase / the AI client.
    window.location.assign(url)
  } catch (e) {
    console.error('OAuth approve failed:', e?.message || e)
    // D-14: the grant did NOT happen, so the screen must not look as though it did.
    actionError.value = t('oauth_consent_error')
    working.value = ''
  }
}

async function deny() {
  actionError.value = ''
  working.value = 'deny'
  try {
    const url = await denyAuthorization(authorizationId.value)
    if (url) window.location.assign(url)
    else denied.value = true
  } catch (e) {
    console.error('OAuth deny failed:', e?.message || e)
    // Nothing was granted, so showing the denied screen is honest even on an error.
    denied.value = true
  } finally {
    working.value = ''
  }
}
</script>

<style scoped>
/*
 * AUTH-SHELL-SCOPED (14/09/2026): .auth_page / .auth_card / .auth_logo / .button_primary
 * and friends are NOT global — main.css carries only their dark-theme overrides. Every
 * auth view (LoginView, JoinView, ResetPasswordConfirmView) declares its own scoped copy,
 * so this one must too. Reusing the class names without the declarations renders an
 * unstyled page, and an unstyled page is a real problem *here*: this is the screen where
 * a user decides whether to hand an AI company access to their customer portfolio, and a
 * broken-looking consent screen is indistinguishable from a phishing one.
 * Values mirror ResetPasswordConfirmView.vue — keep them in step.
 */
.auth_page { min-height:100vh;display:flex;align-items:center;justify-content:center;background:linear-gradient(135deg,#f8f9fb,#ede9fe);padding:20px; }
.auth_card { background:#fff;border-radius:16px;box-shadow:0 4px 24px rgba(0,0,0,.08);padding:40px;width:100%;max-width:440px; }
.auth_logo { display:flex;align-items:center;gap:10px;margin-bottom:24px; }
.auth_brand { font-size:22px;font-weight:700;color:#1a1a2e; }
h1 { font-size:22px;font-weight:700;color:#1a1a2e;margin-bottom:8px; }
.auth_sub { color:#6b7280;margin-bottom:20px;font-size:14px; }
.auth_error { background:#fef2f2;color:#dc2626;border:1px solid #fecaca;border-radius:8px;padding:10px 14px;font-size:14px;margin-bottom:16px; }
.button_primary { background:#7c3aed;color:#fff;border:none;border-radius:8px;padding:12px;font-size:15px;font-weight:600;cursor:pointer;transition:background .2s;display:flex;align-items:center;justify-content:center;gap:8px;text-decoration:none; }
.button_primary:hover:not(:disabled) { background:#6d28d9; }
.button_primary:disabled { opacity:.6;cursor:not-allowed; }
.button_secondary { background:#fff;color:#374151;border:1.5px solid #e5e7eb;border-radius:8px;padding:12px;font-size:15px;font-weight:600;cursor:pointer;transition:border-color .2s;display:flex;align-items:center;justify-content:center;gap:8px;text-decoration:none;margin-top:8px; }
.button_secondary:hover:not(:disabled) { border-color:#7c3aed; }
.button_secondary:disabled { opacity:.6;cursor:not-allowed; }
.full { width:100%; }
.spinner { width:16px;height:16px;border:2px solid rgba(255,255,255,.4);border-top-color:#fff;border-radius:50%;animation:spin .7s linear infinite;flex-shrink:0; }
@keyframes spin { to { transform:rotate(360deg); } }
.blocked_header { text-align:center;padding:16px 0; }
.success_icon { font-size:52px;margin-bottom:16px; }

.consent_loading { display:flex;align-items:center;gap:8px;justify-content:center;padding:24px 0;color:#6b7280; }
.consent_account { font-size:13px;color:#6b7280;margin:4px 0 16px; }
.consent_block { margin:0 0 16px; }
.consent_block_title { font-size:13px;font-weight:600;color:#374151;margin:0 0 6px; }
.consent_list { margin:0;padding-left:20px;font-size:14px;line-height:1.7;color:#374151; }
.consent_can li::marker { content:'✓  ';color:#16a34a; }
.consent_cannot li::marker { content:'✗  ';color:#dc2626; }
.consent_revoke { font-size:12px;color:#6b7280;margin:0 0 16px; }
</style>

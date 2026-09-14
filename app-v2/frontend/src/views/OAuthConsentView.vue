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
.consent_loading { display: flex; align-items: center; gap: 8px; justify-content: center; padding: 24px 0; }
.consent_account { font-size: 13px; color: var(--text-muted, #6b7280); margin: 4px 0 16px; text-align: center; }
.consent_block { margin: 0 0 16px; }
.consent_block_title { font-size: 13px; font-weight: 600; margin: 0 0 6px; }
.consent_list { margin: 0; padding-left: 18px; font-size: 14px; line-height: 1.7; }
.consent_can li::marker { content: '✓  '; color: #16a34a; }
.consent_cannot li::marker { content: '✗  '; color: #dc2626; }
.consent_revoke { font-size: 12px; color: var(--text-muted, #6b7280); margin: 0 0 16px; }
</style>

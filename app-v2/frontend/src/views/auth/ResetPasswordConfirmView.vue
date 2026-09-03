<template>
  <div class="auth-page">
    <div class="auth-card">
      <div class="auth-logo">
        <ScalyoLogo :size="48" /><span class="auth-brand">Scalyo</span>
      </div>

      <!-- Chargement / vérification du lien -->
      <div v-if="state === 'loading'" class="state-loading">
        <div class="spinner-lg" />
        <p>{{ t('reset_confirm_checking') }}</p>
      </div>

      <!-- Lien invalide ou expiré -->
      <div v-else-if="state === 'invalid'" class="state-error">
        <div class="error-icon">⚠️</div>
        <h1>{{ t('reset_confirm_invalid_title') }}</h1>
        <p class="auth-sub">{{ t('reset_confirm_invalid_body') }}</p>
        <router-link to="/reset-password" class="btn-primary full">{{ t('reset_confirm_request_new') }}</router-link>
      </div>

      <!-- Formulaire nouveau mot de passe -->
      <template v-else-if="state === 'form'">
        <h1>{{ t('reset_confirm_title') }}</h1>
        <p class="auth-sub">{{ t('reset_confirm_subtitle') }}</p>
        <div v-if="errorMsg" class="auth-error">{{ errorMsg }}</div>
        <form @submit.prevent="handleSubmit" class="auth-form">
          <div class="fg">
            <label>{{ t('reset_confirm_new_pw') }}</label>
            <input
              v-model="password"
              type="password"
              required
              class="fi"
              placeholder="••••••••"
              autocomplete="new-password"
              minlength="8"
            />
          </div>
          <div class="fg">
            <label>{{ t('reset_confirm_repeat_pw') }}</label>
            <input
              v-model="passwordConfirm"
              type="password"
              required
              class="fi"
              placeholder="••••••••"
              autocomplete="new-password"
              minlength="8"
            />
          </div>
          <button type="submit" class="btn-primary full" :disabled="loading">
            <span v-if="loading" class="spinner" />
            <span v-else>{{ t('reset_confirm_submit') }}</span>
          </button>
        </form>
      </template>

      <!-- Succès -->
      <div v-else-if="state === 'success'" class="reset-success">
        <div class="success-icon">✅</div>
        <p class="success-msg">{{ t('reset_confirm_success') }}</p>
        <router-link to="/login" class="btn-primary full mt">{{ t('reset_back_login') }}</router-link>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { supabase } from '@/lib/supabase'
import ScalyoLogo from '@/components/ScalyoLogo.vue'

const { t } = useI18n({ useScope: 'global' })
const router = useRouter()

const state           = ref('loading')
const password        = ref('')
const passwordConfirm = ref('')
const loading         = ref(false)
const errorMsg        = ref('')

onMounted(async () => {
  // Supabase traite automatiquement le hash de l'URL et émet PASSWORD_RECOVERY
  const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
    if (event === 'PASSWORD_RECOVERY') {
      state.value = 'form'
      subscription.unsubscribe()
    }
  })
  // Rattrapage : detectSessionInUrl traite le hash AU BOOT — l'event peut être
  // émis AVANT le mount de cette vue (route lazy) et donc raté. Si une session
  // existe déjà, le lien était valide → afficher le formulaire.
  const { data: { session } } = await supabase.auth.getSession()
  if (session && state.value === 'loading') {
    state.value = 'form'
    subscription.unsubscribe()
  }
  // Fallback : si aucun event après 4s → lien invalide
  setTimeout(() => {
    if (state.value === 'loading') state.value = 'invalid'
  }, 4000)
})

async function handleSubmit() {
  errorMsg.value = ''
  if (password.value !== passwordConfirm.value) {
    errorMsg.value = t('reset_confirm_err_mismatch')
    return
  }
  if (password.value.length < 8) {
    errorMsg.value = t('reset_confirm_err_short')
    return
  }
  loading.value = true
  const { error } = await supabase.auth.updateUser({ password: password.value })
  loading.value = false
  if (error) {
    // Messages véridiques par cause réelle (contrat 16/07) — motif brut en console
    console.warn('[reset-confirm] updateUser failed:', error.code || error.name || error.status, error.message)
    if (error.code === 'same_password') {
      errorMsg.value = t('reset_confirm_err_same_pw')
    } else if (error.code === 'session_expired' || error.name === 'AuthSessionMissingError' || error.status === 401 || error.status === 403) {
      errorMsg.value = t('reset_confirm_err_expired')
    } else if (error.code === 'over_request_rate_limit' || error.status === 429) {
      errorMsg.value = t('reset_err_rate_limit')
    } else {
      errorMsg.value = t('reset_confirm_err_generic')
    }
  } else {
    state.value = 'success'
    setTimeout(() => router.push('/login'), 3000)
  }
}
</script>

<style scoped>
.auth-page { min-height:100vh;display:flex;align-items:center;justify-content:center;background:linear-gradient(135deg,#f8f9fb,#ede9fe);padding:20px; }
.auth-card { background:#fff;border-radius:16px;box-shadow:0 4px 24px rgba(0,0,0,.08);padding:40px;width:100%;max-width:400px; }
.auth-logo { display:flex;align-items:center;gap:10px;margin-bottom:24px; }
.auth-brand { font-size:22px;font-weight:700;color:#1a1a2e; }
h1 { font-size:22px;font-weight:700;color:#1a1a2e;margin-bottom:8px; }
.auth-sub { color:#6b7280;margin-bottom:20px;font-size:14px; }
.auth-error { background:#fef2f2;color:#dc2626;border:1px solid #fecaca;border-radius:8px;padding:10px 14px;font-size:14px;margin-bottom:16px; }
.auth-form { display:flex;flex-direction:column;gap:16px; }
.fg { display:flex;flex-direction:column;gap:6px; }
.fg label { font-size:14px;font-weight:500;color:#374151; }
.fi { border:1.5px solid #e5e7eb;border-radius:8px;padding:10px 14px;font-size:14px;outline:none;transition:border-color .2s; }
.fi:focus { border-color:#7c3aed; }
.btn-primary { background:#7c3aed;color:#fff;border:none;border-radius:8px;padding:12px;font-size:15px;font-weight:600;cursor:pointer;transition:background .2s;display:flex;align-items:center;justify-content:center;gap:8px;text-decoration:none; }
.btn-primary:hover:not(:disabled) { background:#6d28d9; }
.btn-primary:disabled { opacity:.6;cursor:not-allowed; }
.full { width:100%; }
.mt { margin-top:8px; }
.spinner { width:16px;height:16px;border:2px solid rgba(255,255,255,.4);border-top-color:#fff;border-radius:50%;animation:spin .7s linear infinite;flex-shrink:0; }
.spinner-lg { width:36px;height:36px;border:3px solid #e5e7eb;border-top-color:#7c3aed;border-radius:50%;animation:spin .7s linear infinite;margin:0 auto 16px; }
@keyframes spin { to { transform:rotate(360deg); } }
.state-loading { text-align:center;padding:24px 0;color:#6b7280; }
.state-error { text-align:center;padding:16px 0; }
.error-icon { font-size:48px;margin-bottom:16px; }
.reset-success { text-align:center;padding:24px 0; }
.success-icon { font-size:52px;margin-bottom:16px; }
.success-msg { font-size:16px;font-weight:600;color:#1a1a2e;margin-bottom:16px; }
</style>
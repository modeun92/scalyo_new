<template>
  <div class="auth-page">
    <div class="auth-card">
      <div class="auth-logo"><ScalyoLogo :size="48" /><span class="auth-brand">Scalyo</span></div>
      <h1>{{ t('login_title') }}</h1>

      <!-- Email verified banner -->
      <div v-if="emailVerified" class="verified-banner">
        {{ t('login_email_verified') }}
      </div>

      <p class="auth-sub">{{ t('login_subtitle') }}</p>
      <div v-if="errorMsg" class="auth-error">{{ errorMsg }}</div>

      <form @submit.prevent="handleLogin" class="auth-form">
        <div class="fg">
          <label>{{ t('login_email') }}</label>
          <input v-model="email" type="email" required class="fi" :placeholder="t('login_email_ph')" autocomplete="email" />
        </div>
        <div class="fg">
          <label>{{ t('login_password') }}</label>
          <input v-model="password" type="password" required class="fi" placeholder="••••••••" autocomplete="current-password" />
        </div>
        <div class="forgot-pw-wrap">
          <router-link to="/reset-password" class="link">{{ t('login_forgot_password') }}</router-link>
        </div>
        <button type="submit" class="btn-primary full" :disabled="loading">
          <span v-if="loading" class="spinner" />
          <span v-else>{{ t('login_submit') }}</span>
        </button>
      </form>

      <p class="auth-footer">
        {{ t('login_no_account') }}
        <a href="/#pricing" class="link">{{ t('login_signup') }}</a>
      </p>

      <!-- Legal footer — inside .auth-card -->
      <div class="auth-legal-footer">
        {{ t('register_cgu_accept') }}
        <router-link to="/cgu" target="_blank">{{ t('register_cgu_link') }}</router-link>
        {{ t('register_cgu_and') }}
        <router-link to="/privacy" target="_blank">{{ t('register_privacy_link') }}</router-link>{{ t('register_cgu_suffix') }}
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useAuthStore } from '@/stores/auth'
import ScalyoLogo from '@/components/ScalyoLogo.vue'

const { t } = useI18n({ useScope: 'global' })
const router = useRouter()
const route = useRoute()
const emailVerified = computed(() => route.query.verified === 'true' || route.query.verified === '1')
const authStore = useAuthStore()

const email = ref('')
const password = ref('')
const errorMsg = ref('')
const loading = ref(false)

async function handleLogin() {
  errorMsg.value = ''
  loading.value = true
  try {
    const loginPromise = authStore.login(email.value, password.value)
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('timeout')), 15000)
    )
    const result = await Promise.race([loginPromise, timeoutPromise])
    if (result.success) {
      // Lot 6 : honorer ?redirect= (retour vers /join pour un clic EXPLICITE
      // d'acceptation d'invitation). Chemin interne uniquement : un '//' ou une
      // URL absolue serait une redirection ouverte.
      const target = typeof route.query.redirect === 'string' ? route.query.redirect : ''
      const safe = target.startsWith('/') && !target.startsWith('//') ? target : ''
      router.push(safe || '/app/dashboard')
    } else {
      errorMsg.value = result.error || t('login_error_default')
    }
  } catch (err) {
    errorMsg.value = err.message === 'timeout'
      ? t('login_error_timeout')
      : (err.message || t('login_error_default'))
  } finally {
    loading.value = false
  }
}
</script>

<style scoped>
.auth-page { min-height: 100vh; display: flex; align-items: center; justify-content: center; background: linear-gradient(135deg, #f8f9fb, #ede9fe); padding: 20px; }
.auth-card { background-color: var(--bg-card); border-radius: 20px; padding: 48px 40px; width: 100%; max-width: 420px; box-shadow: 0 20px 60px rgba(0,0,0,0.08); }
.auth-logo { display: flex; align-items: center; gap: 10px; justify-content: center; margin-bottom: 32px; }
.auth-brand { font-size: 1.5rem; font-weight: 800; background: linear-gradient(135deg, #7c3aed, #a78bfa); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
.auth-card h1 { font-size: 1.5rem; font-weight: 800; text-align: center; margin-bottom: 6px; }
.auth-sub { font-size: 0.88rem; color: #6b7280; text-align: center; margin-bottom: 28px; }
.auth-form { display: flex; flex-direction: column; gap: 16px; }
.fg { display: flex; flex-direction: column; gap: 4px; }
.fg label { font-size: 0.78rem; font-weight: 600; color: #6b7280; }
.fi { padding: 11px 14px; border: 1px solid var(--border-color); border-radius: 10px; font-size: 0.9rem; outline: none; transition: border-color 0.15s; }
.fi:focus { border-color: #7c3aed; }
.btn-primary { background: #7c3aed; color: #fff; border: none; padding: 12px; border-radius: 10px; font-size: 0.95rem; font-weight: 600; cursor: pointer; transition: all 0.2s; display: flex; align-items: center; justify-content: center; min-height: 44px; }
.btn-primary:hover:not(:disabled) { background: #6d28d9; transform: translateY(-1px); }
.btn-primary:disabled { opacity: 0.65; cursor: not-allowed; }
.btn-primary.full { width: 100%; }
.forgot-pw-wrap { text-align: right; margin-top: -4px; }
.auth-footer { text-align: center; margin-top: 20px; font-size: 0.85rem; color: #6b7280; }
.link { color: #7c3aed; font-weight: 600; text-decoration: none; }
.link:hover { text-decoration: underline; }
.auth-error { background: #fef2f2; border: 1px solid #fecaca; color: #dc2626; border-radius: 8px; padding: 10px 14px; font-size: 0.85rem; margin-bottom: 16px; }
.spinner { width: 18px; height: 18px; border: 2px solid rgba(255,255,255,0.4); border-top-color: #fff; border-radius: 50%; animation: spin 0.7s linear infinite; display: inline-block; }
@keyframes spin { to { transform: rotate(360deg); } }
.verified-banner { background: #dcfce7; border: 1px solid #86efac; color: #166534; border-radius: 8px; padding: 10px 14px; font-size: 0.84rem; font-weight: 500; text-align: center; margin-bottom: 4px; animation: slide-in 0.3s ease; }
@keyframes slide-in { from { opacity: 0; transform: translateY(-6px); } to { opacity: 1; transform: translateY(0); } }
.auth-legal-footer { text-align: center; font-size: 0.75rem; color: #9ca3af; margin-top: 24px; padding-top: 16px; border-top: 1px solid #f3f4f6; line-height: 1.6; }
.auth-legal-footer a { color: #7c3aed; text-decoration: none; }
.auth-legal-footer a:hover { text-decoration: underline; }
</style>

<template>
  <div class="auth-page">
    <div class="auth-card">
      <div class="auth-logo">
        <ScalyoLogo :size="48" /><span class="auth-brand">Scalyo</span>
      </div>
      <h1>{{ t('reset_title') }}</h1>

      <!-- Success state -->
      <div v-if="sent" class="reset-success">
        <div class="success-icon">✉️</div>
        <p class="success-msg">{{ t('reset_success') }}</p>
        <p class="success-sub">{{ t('reset_check_spam') }}</p>
        <router-link to="/login" class="link">{{ t('reset_back_login') }}</router-link>
      </div>

      <!-- Formulaire -->
      <template v-else>
        <p class="auth-sub">{{ t('reset_subtitle') }}</p>
        <div v-if="errorMsg" class="auth-error">{{ errorMsg }}</div>
        <form @submit.prevent="handleReset" class="auth-form">
          <div class="fg">
            <label>{{ t('login_email') }}</label>
            <input
              v-model="email"
              type="email"
              required
              class="fi"
              :placeholder="t('reset_email_ph')"
              autocomplete="email"
            />
          </div>
          <button type="submit" class="btn-primary full" :disabled="loading">
            <span v-if="loading" class="spinner" />
            <span v-else>{{ t('reset_send') }}</span>
          </button>
        </form>
        <p class="auth-footer">
          <router-link to="/login" class="link">{{ t('reset_back_login') }}</router-link>
        </p>
      </template>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useAuthStore } from '@/stores/auth'
import ScalyoLogo from '@/components/ScalyoLogo.vue'

const { t } = useI18n({ useScope: 'global' })
const authStore = useAuthStore()

const email    = ref('')
const loading  = ref(false)
const errorMsg = ref('')
const sent     = ref(false)

async function handleReset() {
  if (!email.value.trim()) {
    errorMsg.value = t('reset_err_required')
    return
  }
  errorMsg.value = ''
  loading.value  = true
  const result   = await authStore.resetPassword(email.value.trim())
  loading.value  = false
  if (result.error) {
    const err = result.error
    // Truthful messages by real cause (contract 16/07) — raw reason in the console
    console.warn('[reset] resetPasswordForEmail failed:', err.code || err.status, err.message)
    if (err.code === 'over_email_send_rate_limit' || err.status === 429) {
      errorMsg.value = t('reset_err_rate_limit')
    } else {
      errorMsg.value = t('reset_err_generic')
    }
  } else {
    sent.value = true
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
.btn-primary { background:#7c3aed;color:#fff;border:none;border-radius:8px;padding:12px;font-size:15px;font-weight:600;cursor:pointer;transition:background .2s;display:flex;align-items:center;justify-content:center;gap:8px; }
.btn-primary:hover:not(:disabled) { background:#6d28d9; }
.btn-primary:disabled { opacity:.6;cursor:not-allowed; }
.full { width:100%; }
.spinner { width:16px;height:16px;border:2px solid rgba(255,255,255,.4);border-top-color:#fff;border-radius:50%;animation:spin .7s linear infinite;flex-shrink:0; }
@keyframes spin { to { transform:rotate(360deg); } }
.auth-footer { text-align:center;font-size:14px;color:#6b7280;margin-top:16px; }
.link { color:#7c3aed;text-decoration:none;font-weight:500; }
.link:hover { text-decoration:underline; }
.reset-success { text-align:center;padding:24px 0; }
.success-icon { font-size:52px;margin-bottom:16px; }
.success-msg { font-size:16px;font-weight:600;color:#1a1a2e;margin-bottom:8px; }
.success-sub { font-size:14px;color:#6b7280;margin-bottom:24px; }
</style>
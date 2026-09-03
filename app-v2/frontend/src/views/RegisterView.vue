<template>
  <div class="auth-page">
    <div class="auth-card">
      <div class="auth-logo">
        <ScalyoLogo :size="48" /><span class="auth-brand">Scalyo</span>
      </div>

      <!-- SUCCESS: check your email -->
      <template v-if="success">
        <div class="success-header">
          <div class="success-icon">📧</div>
          <h1>{{ t('register_success_title') }}</h1>
          <p class="auth-sub">{{ t('register_success_subtitle') }}</p>
        </div>
        <div class="email-notice">
          {{ t('register_check_email') }}
        </div>
        <p class="auth-footer">
          {{ t('register_confirm_email_first') }}
          <router-link to="/login" class="link">{{ t('register_go_login') }}</router-link>
        </p>
      </template>

      <!-- FORM -->
      <template v-else>
        <h1>{{ t('register_title') }}</h1>
        <p class="auth-sub">{{ t('register_subtitle') }}</p>

        <!-- Alpha badge -->
        <div v-if="codeVerified" class="alpha-badge">{{ t('alpha_access_granted') }}</div>

        <div v-if="errorMsg" class="auth-error">{{ errorMsg }}</div>

        <form @submit.prevent="handleRegister" class="auth-form">
          <!-- Alpha invite code — first field, prominent -->
          <div class="fg">
            <label>{{ t('alpha_code_label') }}</label>
            <div class="invite-row">
              <input
                v-model="inviteCode"
                type="text"
                required
                class="fi"
                :class="{ 'fi-valid': codeVerified, 'fi-invalid': codeError }"
                :placeholder="t('alpha_code_placeholder')"
                :disabled="codeVerified"
                autocomplete="off"
                @blur="verifyCode"
              />
              <button
                v-if="!codeVerified"
                type="button"
                class="btn-verify"
                :disabled="verifying || !inviteCode.trim()"
                @click="verifyCode"
              >
                <span v-if="verifying" class="spinner-sm" />
                <span v-else>{{ t('alpha_code_verify') }}</span>
              </button>
              <span v-else class="check-icon">✓</span>
            </div>
            <span v-if="codeError" class="field-error">{{ codeError }}</span>
          </div>

          <!-- Rest of form — disabled until code is verified -->
          <fieldset :disabled="!codeVerified" class="register-fields">
            <div class="fg-row">
              <div class="fg">
                <label>{{ t('register_firstname') }}</label>
                <input v-model="firstName" type="text" required class="fi" />
              </div>
              <div class="fg">
                <label>{{ t('register_lastname') }}</label>
                <input v-model="lastName" type="text" required class="fi" />
              </div>
            </div>

            <div class="fg">
              <label>{{ t('login_email') }}</label>
              <input v-model="email" type="email" required class="fi" autocomplete="email" :placeholder="t('login_email_ph')" />
            </div>

            <div class="fg">
              <label>{{ t('login_password') }}</label>
              <input v-model="password" type="password" required class="fi" minlength="8" :placeholder="t('register_password_ph')" />
              <div v-if="password.length > 0" class="pw-strength">
                <div class="pw-bar">
                  <div class="pw-fill" :class="pwStrengthClass" :style="{ width: pwStrengthPct + '%' }"></div>
                </div>
                <span class="pw-label" :class="pwStrengthClass">{{ t(pwStrengthKey) }}</span>
              </div>
            </div>

            <!-- CGU checkbox — RGPD compliant -->
            <label class="cgu-check">
              <input v-model="cguAccepted" type="checkbox" class="cgu-input" />
              <span class="cgu-text">
                {{ t('register_cgu_accept') }}
                <router-link to="/cgu" target="_blank" class="link">{{ t('register_cgu_link') }}</router-link>
                {{ t('register_cgu_and') }}
                <router-link to="/privacy" target="_blank" class="link">{{ t('register_privacy_link') }}</router-link>{{ t('register_cgu_suffix') }}
              </span>
            </label>

            <button type="submit" class="btn-primary full" :disabled="loading || !cguAccepted || !codeVerified">
              <span v-if="loading" class="spinner" />
              <span v-else>{{ t('register_submit') }}</span>
            </button>
          </fieldset>
        </form>

        <p class="auth-footer">
          {{ t('register_has_account') }}
          <router-link to="/login" class="link">{{ t('login_submit') }}</router-link>
        </p>
      </template>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useAuthStore } from '@/stores/auth'
import ScalyoLogo from '@/components/ScalyoLogo.vue'

const { t, locale: currentLocale } = useI18n({ useScope: 'global' })
const authStore = useAuthStore()

const firstName = ref('')
const lastName = ref('')
const email = ref('')
const password = ref('')
const errorMsg = ref('')
const loading = ref(false)
const success = ref(false)
const cguAccepted = ref(false)

// Alpha invite code
const inviteCode = ref('')
const codeVerified = ref(false)
const codeError = ref('')
const verifying = ref(false)

async function verifyCode() {
  if (codeVerified.value || !inviteCode.value.trim()) return

  codeError.value = ''
  verifying.value = true

  try {
    const resp = await fetch('/api/alpha/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        code: inviteCode.value.trim(),
        lang: currentLocale.value
      })
    })

    const data = await resp.json()

    if (resp.ok && data.valid) {
      codeVerified.value = true
      localStorage.setItem('scalyo_promo_code', JSON.stringify({ code: inviteCode.value.trim(), plan: data.plan, maxSeats: data.maxSeats, validDays: data.validDays }))
    } else {
      codeError.value = data.error || t('alpha_code_invalid')
    }
  } catch {
    codeError.value = t('alpha_code_error')
  } finally {
    verifying.value = false
  }
}

// Password strength
const pwScore = computed(() => {
  const p = password.value
  if (p.length < 8) return 0
  let s = 1
  if (p.length >= 10) s++
  if (/[A-Z]/.test(p) && /[a-z]/.test(p)) s++
  if (/\d/.test(p)) s++
  if (/[^A-Za-z0-9]/.test(p)) s++
  return Math.min(s, 4)
})
const pwStrengthClass = computed(() => ['', 'pw-weak', 'pw-fair', 'pw-good', 'pw-strong'][pwScore.value] || '')
const pwStrengthPct = computed(() => pwScore.value * 25)
const pwStrengthKey = computed(() => ['', 'register_pw_weak', 'register_pw_fair', 'register_pw_good', 'register_pw_strong'][pwScore.value] || '')

async function handleRegister() {
  if (!codeVerified.value) return

  errorMsg.value = ''
  loading.value = true

  const result = await authStore.register(
    email.value, password.value,
    firstName.value, lastName.value,
    currentLocale.value
  )

  loading.value = false

  if (result.success) {
    // Activate promo code — create org + owner
    try {
      const promoData = JSON.parse(localStorage.getItem('scalyo_promo_code') || '{}')
      if (promoData.code && result.user?.id) {
        await fetch('/api/alpha/activate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            code: promoData.code,
            userId: result.user.id,
            email: email.value,
            companyName: '',
            lang: currentLocale.value
          })
        })
        localStorage.removeItem('scalyo_promo_code')
      }
    } catch (e) {
      console.error('Promo activation error:', e)
    }
    success.value = true
  } else {
    errorMsg.value = result.error
  }
}
</script>

<style scoped>
.auth-page { min-height: 100vh; display: flex; align-items: center; justify-content: center; background: linear-gradient(135deg, #f8f9fb, #ede9fe); padding: 20px; }
.auth-card { background-color: var(--bg-card); border-radius: 20px; padding: 48px 40px; width: 100%; max-width: 460px; box-shadow: 0 20px 60px rgba(0,0,0,0.08); }
.auth-logo { display: flex; align-items: center; gap: 10px; justify-content: center; margin-bottom: 32px; }
.auth-brand { font-size: 1.5rem; font-weight: 800; background: linear-gradient(135deg, #7c3aed, #a78bfa); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
.auth-card h1 { font-size: 1.5rem; font-weight: 800; text-align: center; margin-bottom: 6px; }
.auth-sub { font-size: 0.88rem; color: #6b7280; text-align: center; margin-bottom: 28px; }

/* Alpha badge */
.alpha-badge { background: linear-gradient(135deg, #7c3aed, #6d28d9); color: #fff; text-align: center; padding: 8px 16px; border-radius: 8px; font-size: 0.8rem; font-weight: 600; margin-bottom: 16px; letter-spacing: 0.02em; }

/* Invite code */
.invite-row { display: flex; gap: 8px; align-items: center; }
.invite-row .fi { flex: 1; text-transform: uppercase; letter-spacing: 0.08em; font-weight: 600; }
.btn-verify { background: #f3f4f6; border: 1px solid var(--border-color); color: var(--text-primary); padding: 11px 16px; border-radius: 10px; font-size: 0.82rem; font-weight: 600; cursor: pointer; transition: all 0.15s; white-space: nowrap; }
.btn-verify:hover:not(:disabled) { background: #e5e7eb; }
.btn-verify:disabled { opacity: 0.4; cursor: not-allowed; }
.check-icon { color: #059669; font-size: 1.2rem; font-weight: 700; flex-shrink: 0; width: 28px; text-align: center; }
.fi-valid { border-color: #059669; background: #f0fdf4; }
.fi-invalid { border-color: #ef4444; }
.field-error { font-size: 0.75rem; color: #dc2626; margin-top: 2px; }
.spinner-sm { width: 14px; height: 14px; border: 2px solid rgba(0,0,0,0.15); border-top-color: #374151; border-radius: 50%; animation: spin 0.7s linear infinite; display: inline-block; }

/* Register fields fieldset */
.register-fields { border: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 16px; }
.register-fields:disabled { opacity: 0.4; pointer-events: none; }

/* Success */
.success-header { text-align: center; margin-bottom: 20px; }
.success-icon { font-size: 2.5rem; margin-bottom: 12px; }
.email-notice { background: #f0fdf4; border: 1px solid #bbf7d0; color: #166534; border-radius: 10px; padding: 16px 20px; font-size: 0.88rem; text-align: center; line-height: 1.6; }

/* Form */
.auth-form { display: flex; flex-direction: column; gap: 16px; }
.fg-row { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.fg { display: flex; flex-direction: column; gap: 4px; }
.fg label { font-size: 0.78rem; font-weight: 600; color: #6b7280; }
.fi { padding: 11px 14px; border: 1px solid var(--border-color); border-radius: 10px; font-size: 0.9rem; outline: none; transition: border-color 0.15s; }
.fi:focus { border-color: #7c3aed; }

/* Password strength */
.pw-strength { display: flex; align-items: center; gap: 8px; margin-top: 4px; }
.pw-bar { flex: 1; height: 4px; background: #e5e7eb; border-radius: 2px; overflow: hidden; }
.pw-fill { height: 100%; border-radius: 2px; transition: width 0.3s, background 0.3s; }
.pw-fill.pw-weak { background: #ef4444; }
.pw-fill.pw-fair { background: #f59e0b; }
.pw-fill.pw-good { background: #10b981; }
.pw-fill.pw-strong { background: #059669; }
.pw-label { font-size: 0.72rem; font-weight: 600; white-space: nowrap; }
.pw-label.pw-weak { color: #ef4444; }
.pw-label.pw-fair { color: #f59e0b; }
.pw-label.pw-good { color: #10b981; }
.pw-label.pw-strong { color: #059669; }

/* CGU checkbox */
.cgu-check { display: flex; align-items: flex-start; gap: 8px; cursor: pointer; margin-top: 4px; }
.cgu-input { margin-top: 3px; accent-color: #7c3aed; width: 16px; height: 16px; flex-shrink: 0; }
.cgu-text { font-size: 0.78rem; color: #6b7280; line-height: 1.5; }

/* Button */
.btn-primary { background: #7c3aed; color: #fff; border: none; padding: 12px; border-radius: 10px; font-size: 0.95rem; font-weight: 600; cursor: pointer; transition: all 0.2s; display: flex; align-items: center; justify-content: center; min-height: 44px; }
.btn-primary:hover:not(:disabled) { background: #6d28d9; transform: translateY(-1px); }
.btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }
.btn-primary.full { width: 100%; }

.auth-footer { text-align: center; margin-top: 20px; font-size: 0.85rem; color: #6b7280; }
.link { color: #7c3aed; font-weight: 600; text-decoration: none; }
.link:hover { text-decoration: underline; }
.auth-error { background: #fef2f2; border: 1px solid #fecaca; color: #dc2626; border-radius: 8px; padding: 10px 14px; font-size: 0.85rem; margin-bottom: 16px; }
.spinner { width: 18px; height: 18px; border: 2px solid rgba(255,255,255,0.4); border-top-color: #fff; border-radius: 50%; animation: spin 0.7s linear infinite; display: inline-block; }
@keyframes spin { to { transform: rotate(360deg); } }

@media (max-width: 640px) {
  .auth-card { padding: 32px 20px; }
  .fg-row { grid-template-columns: 1fr; }
}
</style>

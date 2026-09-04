<template>
  <div class="auth_page">
    <div class="auth_card">
      <div class="auth_logo">
        <ScalyoLogo :size="48" /><span class="auth_brand">Scalyo</span>
      </div>

      <!-- SUCCESS: check your email -->
      <template v-if="success">
        <div class="success_header">
          <div class="success_icon">📧</div>
          <h1>{{ t('register_success_title') }}</h1>
          <p class="auth_sub">{{ t('register_success_subtitle') }}</p>
        </div>
        <div class="email_notice">
          {{ t('register_check_email') }}
        </div>
        <p class="auth_footer">
          {{ t('register_confirm_email_first') }}
          <router-link to="/login" class="link">{{ t('register_go_login') }}</router-link>
        </p>
      </template>

      <!-- FORM -->
      <template v-else>
        <h1>{{ t('register_title') }}</h1>
        <p class="auth_sub">{{ t('register_subtitle') }}</p>

        <!-- Alpha badge -->
        <div v-if="codeVerified" class="alpha_badge">{{ t('alpha_access_granted') }}</div>

        <div v-if="errorMsg" class="auth_error">{{ errorMsg }}</div>

        <form @submit.prevent="handleRegister" class="auth_form">
          <!-- Alpha invite code — first field, prominent -->
          <div class="field_group">
            <label>{{ t('alpha_code_label') }}</label>
            <div class="invite_row">
              <input
                v-model="inviteCode"
                type="text"
                required
                class="field_input"
                :class="{ 'field_input_valid': codeVerified, 'field_input_invalid': codeError }"
                :placeholder="t('alpha_code_placeholder')"
                :disabled="codeVerified"
                autocomplete="off"
                @blur="verifyCode"
              />
              <button
                v-if="!codeVerified"
                type="button"
                class="button_verify"
                :disabled="verifying || !inviteCode.trim()"
                @click="verifyCode"
              >
                <span v-if="verifying" class="spinner_small" />
                <span v-else>{{ t('alpha_code_verify') }}</span>
              </button>
              <span v-else class="check_icon">✓</span>
            </div>
            <span v-if="codeError" class="field_error">{{ codeError }}</span>
          </div>

          <!-- Rest of form — disabled until code is verified -->
          <fieldset :disabled="!codeVerified" class="register_fields">
            <div class="field_group_row">
              <div class="field_group">
                <label>{{ t('register_firstname') }}</label>
                <input v-model="firstName" type="text" required class="field_input" />
              </div>
              <div class="field_group">
                <label>{{ t('register_lastname') }}</label>
                <input v-model="lastName" type="text" required class="field_input" />
              </div>
            </div>

            <div class="field_group">
              <label>{{ t('login_email') }}</label>
              <input v-model="email" type="email" required class="field_input" autocomplete="email" :placeholder="t('login_email_ph')" />
            </div>

            <div class="field_group">
              <label>{{ t('login_password') }}</label>
              <input v-model="password" type="password" required class="field_input" minlength="8" :placeholder="t('register_password_ph')" />
              <div v-if="password.length > 0" class="paywall_strength">
                <div class="paywall_bar">
                  <div class="paywall_fill" :class="pwStrengthClass" :style="{ width: pwStrengthPct + '%' }"></div>
                </div>
                <span class="paywall_label" :class="pwStrengthClass">{{ t(pwStrengthKey) }}</span>
              </div>
            </div>

            <!-- CGU checkbox — RGPD compliant -->
            <label class="cgu_check">
              <input v-model="cguAccepted" type="checkbox" class="cgu_input" />
              <span class="cgu_text">
                {{ t('register_cgu_accept') }}
                <router-link to="/cgu" target="_blank" class="link">{{ t('register_cgu_link') }}</router-link>
                {{ t('register_cgu_and') }}
                <router-link to="/privacy" target="_blank" class="link">{{ t('register_privacy_link') }}</router-link>{{ t('register_cgu_suffix') }}
              </span>
            </label>

            <button type="submit" class="button_primary full" :disabled="loading || !cguAccepted || !codeVerified">
              <span v-if="loading" class="spinner" />
              <span v-else>{{ t('register_submit') }}</span>
            </button>
          </fieldset>
        </form>

        <p class="auth_footer">
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
.auth_page { min-height: 100vh; display: flex; align-items: center; justify-content: center; background: linear-gradient(135deg, #f8f9fb, #ede9fe); padding: 20px; }
.auth_card { background-color: var(--bg-card); border-radius: 20px; padding: 48px 40px; width: 100%; max-width: 460px; box-shadow: 0 20px 60px rgba(0,0,0,0.08); }
.auth_logo { display: flex; align-items: center; gap: 10px; justify-content: center; margin-bottom: 32px; }
.auth_brand { font-size: 1.5rem; font-weight: 800; background: linear-gradient(135deg, #7c3aed, #a78bfa); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
.auth_card h1 { font-size: 1.5rem; font-weight: 800; text-align: center; margin-bottom: 6px; }
.auth_sub { font-size: 0.88rem; color: #6b7280; text-align: center; margin-bottom: 28px; }

/* Alpha badge */
.alpha_badge { background: linear-gradient(135deg, #7c3aed, #6d28d9); color: #fff; text-align: center; padding: 8px 16px; border-radius: 8px; font-size: 0.8rem; font-weight: 600; margin-bottom: 16px; letter-spacing: 0.02em; }

/* Invite code */
.invite_row { display: flex; gap: 8px; align-items: center; }
.invite_row .field_input { flex: 1; text-transform: uppercase; letter-spacing: 0.08em; font-weight: 600; }
.button_verify { background: #f3f4f6; border: 1px solid var(--border-color); color: var(--text-primary); padding: 11px 16px; border-radius: 10px; font-size: 0.82rem; font-weight: 600; cursor: pointer; transition: all 0.15s; white-space: nowrap; }
.button_verify:hover:not(:disabled) { background: #e5e7eb; }
.button_verify:disabled { opacity: 0.4; cursor: not-allowed; }
.check_icon { color: #059669; font-size: 1.2rem; font-weight: 700; flex-shrink: 0; width: 28px; text-align: center; }
.field_input_valid { border-color: #059669; background: #f0fdf4; }
.field_input_invalid { border-color: #ef4444; }
.field_error { font-size: 0.75rem; color: #dc2626; margin-top: 2px; }
.spinner_small { width: 14px; height: 14px; border: 2px solid rgba(0,0,0,0.15); border-top-color: #374151; border-radius: 50%; animation: spin 0.7s linear infinite; display: inline-block; }

/* Register fields fieldset */
.register_fields { border: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 16px; }
.register_fields:disabled { opacity: 0.4; pointer-events: none; }

/* Success */
.success_header { text-align: center; margin-bottom: 20px; }
.success_icon { font-size: 2.5rem; margin-bottom: 12px; }
.email_notice { background: #f0fdf4; border: 1px solid #bbf7d0; color: #166534; border-radius: 10px; padding: 16px 20px; font-size: 0.88rem; text-align: center; line-height: 1.6; }

/* Form */
.auth_form { display: flex; flex-direction: column; gap: 16px; }
.field_group_row { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.field_group { display: flex; flex-direction: column; gap: 4px; }
.field_group label { font-size: 0.78rem; font-weight: 600; color: #6b7280; }
.field_input { padding: 11px 14px; border: 1px solid var(--border-color); border-radius: 10px; font-size: 0.9rem; outline: none; transition: border-color 0.15s; }
.field_input:focus { border-color: #7c3aed; }

/* Password strength */
.paywall_strength { display: flex; align-items: center; gap: 8px; margin-top: 4px; }
.paywall_bar { flex: 1; height: 4px; background: #e5e7eb; border-radius: 2px; overflow: hidden; }
.paywall_fill { height: 100%; border-radius: 2px; transition: width 0.3s, background 0.3s; }
.paywall_fill.paywall_weak { background: #ef4444; }
.paywall_fill.paywall_fair { background: #f59e0b; }
.paywall_fill.paywall_good { background: #10b981; }
.paywall_fill.paywall_strong { background: #059669; }
.paywall_label { font-size: 0.72rem; font-weight: 600; white-space: nowrap; }
.paywall_label.paywall_weak { color: #ef4444; }
.paywall_label.paywall_fair { color: #f59e0b; }
.paywall_label.paywall_good { color: #10b981; }
.paywall_label.paywall_strong { color: #059669; }

/* CGU checkbox */
.cgu_check { display: flex; align-items: flex-start; gap: 8px; cursor: pointer; margin-top: 4px; }
.cgu_input { margin-top: 3px; accent-color: #7c3aed; width: 16px; height: 16px; flex-shrink: 0; }
.cgu_text { font-size: 0.78rem; color: #6b7280; line-height: 1.5; }

/* Button */
.button_primary { background: #7c3aed; color: #fff; border: none; padding: 12px; border-radius: 10px; font-size: 0.95rem; font-weight: 600; cursor: pointer; transition: all 0.2s; display: flex; align-items: center; justify-content: center; min-height: 44px; }
.button_primary:hover:not(:disabled) { background: #6d28d9; transform: translateY(-1px); }
.button_primary:disabled { opacity: 0.5; cursor: not-allowed; }
.button_primary.full { width: 100%; }

.auth_footer { text-align: center; margin-top: 20px; font-size: 0.85rem; color: #6b7280; }
.link { color: #7c3aed; font-weight: 600; text-decoration: none; }
.link:hover { text-decoration: underline; }
.auth_error { background: #fef2f2; border: 1px solid #fecaca; color: #dc2626; border-radius: 8px; padding: 10px 14px; font-size: 0.85rem; margin-bottom: 16px; }
.spinner { width: 18px; height: 18px; border: 2px solid rgba(255,255,255,0.4); border-top-color: #fff; border-radius: 50%; animation: spin 0.7s linear infinite; display: inline-block; }
@keyframes spin { to { transform: rotate(360deg); } }

@media (max-width: 640px) {
  .auth_card { padding: 32px 20px; }
  .field_group_row { grid-template-columns: 1fr; }
}
</style>

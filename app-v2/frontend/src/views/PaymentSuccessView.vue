<template>
  <div class="success-page">
    <!-- Confetti particles -->
    <div class="confetti-wrap" aria-hidden="true">
      <span v-for="i in 18" :key="i" class="confetti-piece" :style="confettiStyle(i)" />
    </div>

    <div class="success-card">
      <!-- Logo -->
      <div class="sc-logo">
        <ScalyoLogo :size="40" />
        <span class="sc-brand">Scalyo</span>
      </div>

      <!-- Checkmark -->
      <div class="sc-check">
        <svg viewBox="0 0 56 56" fill="none" width="56" height="56">
          <circle cx="28" cy="28" r="28" fill="#dcfce7"/>
          <path d="M16 28l8 8 16-16" stroke="#16a34a" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </div>

      <h1 class="sc-title">{{ t('success_title') }}</h1>
      <p class="sc-sub">{{ t('success_subtitle') }}</p>

      <!-- Plan badge -->
      <div v-if="planLabel" class="sc-plan-badge">
        <span class="sc-plan-icon">⭐</span>
        <span>{{ t('success_plan') }} <strong>{{ planLabel }}</strong></span>
      </div>

      <!-- What's next -->
      <div class="sc-next">
        <div class="sc-next-item">
          <span class="sc-ni-icon">📧</span>
          <span>{{ t('success_email_sent') }}</span>
        </div>
        <div class="sc-next-item">
          <span class="sc-ni-icon">🚀</span>
          <span>{{ t('success_access_ready') }}</span>
        </div>
      </div>

      <p v-if="provisioningPending" class="sc-pending">{{ t('success_provisioning_pending') }}</p>

      <button class="btn-primary sc-cta" @click="goToDashboard">
        {{ t('success_go_dashboard') }} →
      </button>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter, useRoute } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { supabase } from '@/lib/supabase'
import { fmtCurrency } from '@/lib/formatters'
import ScalyoLogo from '@/components/ScalyoLogo.vue'

const { t } = useI18n({ useScope: 'global' })
const router = useRouter()
const route = useRoute()
const auth = useAuthStore()

// PRICE-BY-LANG (contract D1, 29/08): the displayed amount is the amount ACTUALLY billed,
// read from /api/billing (source:'stripe') once the webhook has run — never again a price
// chosen by the interface language. Until Stripe is read: plan only, without an amount.
const billing = ref(null)
const planLabel = computed(() => {
  const p = route.query.plan || auth.currentPlan || ''
  const name = p ? p.charAt(0).toUpperCase() + p.slice(1) : ''
  const b = billing.value
  if (b?.source === 'stripe' && b.unit_amount != null && b.currency) {
    return name + ' — ' + fmtCurrency(b.unit_amount, { currency: b.currency }) + '/' + t('paywall_per_user_month')
  }
  return name
})
async function loadBilling() {
  try {
    const token = (await supabase.auth.getSession()).data.session?.access_token
    if (!token) return
    const resp = await fetch('/api/billing', { headers: { Authorization: 'Bearer ' + token } })
    if (resp.ok) billing.value = await resp.json()
  } catch (_) { /* defensive: plan only, never a guessed amount */ }
}

// ─── Read-only (CR-3 / E-01) ──────────────────────────────────────────
// NO client-side write any more: provisioning comes exclusively from the
// Stripe webhook (service_role). The ?plan= param only serves the optimistic
// label. Profile polling (3 s, max 60 s) while the webhook runs.
const provisioningPending = ref(false)
onMounted(async () => {
  if (!auth.user?.id) return
  const started = Date.now()
  while (Date.now() - started < 60_000) {
    await auth.fetchProfile(auth.user.id)
    // PRICE-BY-LANG: active subscription → read the real Stripe amount for the badge
    if (auth.hasActiveSubscription) { await loadBilling(); return }
    await new Promise(r => setTimeout(r, 3000))
  }
  provisioningPending.value = true
})

function goToDashboard() {
  if (auth.isAuthenticated) {
    router.push('/app/dashboard')
  } else {
    router.push('/login?verified=true')
  }
}


function confettiStyle(i) {
  const colors = ['#7c3aed','#a78bfa','#10b981','#f59e0b','#ef4444','#3b82f6','#ec4899']
  const angle = (i / 18) * 360
  const dist = 120 + (i % 5) * 30
  const x = Math.cos((angle * Math.PI) / 180) * dist
  const y = Math.sin((angle * Math.PI) / 180) * dist - 60
  return {
    '--x': x + 'px',
    '--y': y + 'px',
    '--color': colors[i % colors.length],
    '--delay': (i * 0.08) + 's',
    '--size': (6 + (i % 4) * 3) + 'px',
  }
}
</script>

<style scoped>
.success-page {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #f5f3ff 0%, #ede9fe 50%, #f0fdf4 100%);
  padding: 24px;
  position: relative;
  overflow: hidden;
}
.confetti-wrap {
  position: absolute;
  inset: 0;
  pointer-events: none;
  display: flex;
  align-items: center;
  justify-content: center;
}
.confetti-piece {
  position: absolute;
  width: var(--size);
  height: var(--size);
  background: var(--color);
  border-radius: 50%;
  transform: translate(var(--x), var(--y));
  animation: confetti-pop 0.6s var(--delay) cubic-bezier(0.34,1.56,0.64,1) both;
  opacity: 0.8;
}
@keyframes confetti-pop {
  from { transform: translate(0, 0) scale(0); opacity: 0; }
  to   { transform: translate(var(--x), var(--y)) scale(1); opacity: 0.8; }
}
.success-card {
  background: var(--bg-card);
  border-radius: 24px;
  padding: 48px 40px;
  max-width: 460px;
  width: 100%;
  box-shadow: 0 24px 80px rgba(124,58,237,0.12);
  text-align: center;
  position: relative;
  z-index: 1;
}
.sc-logo {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  margin-bottom: 28px;
}
.sc-brand {
  font-size: 1.4rem;
  font-weight: 800;
  color: #7c3aed;
  letter-spacing: -0.5px;
}
.sc-check {
  margin-bottom: 20px;
  animation: pop 0.4s 0.3s cubic-bezier(0.34,1.56,0.64,1) both;
}
@keyframes pop {
  from { transform: scale(0); opacity: 0; }
  to   { transform: scale(1); opacity: 1; }
}
.sc-title {
  font-size: 1.6rem;
  font-weight: 800;
  margin-bottom: 8px;
  color: #111827;
}
.sc-sub {
  font-size: 0.9rem;
  color: var(--text-secondary);
  margin-bottom: 24px;
  line-height: 1.6;
}
.sc-plan-badge {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  background: #ede9fe;
  border: 1px solid #c4b5fd;
  border-radius: 40px;
  padding: 8px 18px;
  font-size: 0.88rem;
  color: #5b21b6;
  margin-bottom: 24px;
}
.sc-plan-icon { font-size: 1rem; }
.sc-next {
  background: #f9fafb;
  border-radius: 12px;
  padding: 16px 20px;
  margin-bottom: 28px;
  text-align: left;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.sc-next-item {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 0.85rem;
  color: #374151;
}
.sc-ni-icon { font-size: 1.1rem; }
.sc-pending { font-size: 0.82rem; color: #92400e; background: #fef3c7; border: 1px solid #fde68a; border-radius: 8px; padding: 8px 12px; margin-bottom: 16px; }
.btn-primary {
  background: var(--purple);
  color: #fff;
  border: none;
  padding: 14px 32px;
  border-radius: 10px;
  font-size: 0.95rem;
  font-weight: 700;
  cursor: pointer;
  width: 100%;
  transition: all 0.2s;
}
.btn-primary:hover {
  background: #6d28d9;
  transform: translateY(-1px);
  box-shadow: 0 8px 24px rgba(124,58,237,0.3);
}
</style>
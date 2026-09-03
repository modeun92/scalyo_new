<template>
  <div class="sv-panel">
    <!-- Current Plan -->
    <div class="sv-section">
      <h3>{{ t('stg_tab_billing') }}</h3>
      <div class="billing-plan">
        <div class="bp-current">
          <span class="bp-badge">{{ auth.currentPlanLabel }}</span>
          <span class="bp-price">{{ headline }}</span>
        </div>
        <p v-if="summaryLine" class="bp-line">{{ summaryLine }}</p>
        <p v-if="upcomingLine" class="bp-line">{{ upcomingLine }}</p>
        <p v-if="billing.data && !billing.canViewAmounts" class="bp-note">{{ t('stg_billing_managed_by_owner') }}</p>
        <p v-else-if="billing.data?.source === 'table'" class="bp-note">{{ t('stg_billing_indicative') }}</p>
        <p v-else-if="billing.error" class="bp-note">{{ t('stg_billing_error') }}</p>
        <div v-if="billing.canViewAmounts" class="plan-status-row">
          <span class="plan-status" :class="statusClass">{{ statusLabel }}</span>
        </div>
        <p v-if="billing.canViewAmounts && auth.profile?.subscription_end_date" class="bp-end-date">
          {{ t('stg_sub_ends') }} {{ fmtDate(auth.profile.subscription_end_date, { year: 'numeric', month: 'long', day: 'numeric' }) }}
        </p>
        <button
          v-if="billing.canViewAmounts && auth.hasActiveSubscription"
          class="sv-portal-btn"
          :disabled="portalLoading"
          @click="openPortal"
        >
          {{ portalLoading ? t('stg_portal_loading') : t('stg_manage_sub') }}
        </button>
        <p v-if="portalError" class="sv-field-error">{{ t('stg_portal_error') }}</p>
      </div>
    </div>

    <!-- Plans Grid — D1 : owner / admin seulement, prix servis par /api/billing dans la devise du compte -->
    <div v-if="billing.canViewAmounts" class="sv-section">
      <h3>{{ t('stg_plan_title') }}</h3>
      <p class="sv-desc">{{ t('stg_plan_desc') }}</p>
      <div class="plan-grid">
        <div
          v-for="plan in plans"
          :key="plan.key"
          class="plan-card"
          :class="{ featured: plan.featured, current: auth.currentPlan === plan.key }"
        >
          <span v-if="plan.featured" class="plan-pop">{{ t('stg_plan_popular') }}</span>
          <h4>{{ plan.name }}</h4>
          <p class="plan-price">{{ gridPrice(plan.key) }}<span v-if="plan.key !== 'enterprise'">/{{ t('stg_per_seat') }}</span></p>
          <ul>
            <li v-for="f in plan.features" :key="f">{{ t(f) }}</li>
          </ul>
          <button
            class="plan-btn"
            :disabled="auth.currentPlan === plan.key"
            @click="handlePlanChange(plan.url, plan.key)"
          >
            {{ getPlanButtonLabel(plan.key) }}
          </button>
        </div>
      </div>
      <p class="bp-note">{{ t('stg_stripe_note') }}</p>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useAuthStore } from '@/stores/auth'
import { useBillingStore } from '@/stores/billing'
import { supabase } from '@/lib/supabase'
import { stripeCheckoutUrl } from '@/config/stripeLinks'
import { fmtCurrency, fmtDate } from '@/lib/formatters'

const { t } = useI18n({ useScope: 'global' })
const auth = useAuthStore()
const billing = useBillingStore()

const email = computed(() => auth.user?.email || '')
const portalLoading = ref(false)
const portalError = ref(false)

onMounted(() => billing.load())

// BILLING-SEAT (27/08) : plus aucun prix côté front — montants (unité majeure) et devise viennent de
// /api/billing, formatés par le seul formateur du produit. 397,5 → 2 décimales, 795 → aucune.
function money(v) {
  if (v == null) return '—'
  return fmtCurrency(v, { currency: billing.currency, decimals: Number.isInteger(v) ? 0 : 2 })
}

const headline = computed(() => {
  const d = billing.data
  if (auth.currentPlan === 'enterprise') return t('plan_enterprise_price')
  if (!d) return billing.loading ? '' : '—'
  if (!d.can_view_amounts) return t('stg_billing_seats', d.seats)
  return d.unit_amount == null ? '—' : t('stg_billing_unit', { amount: money(d.unit_amount) })
})

// « 5 sièges · 795 €/mois » — owner/admin seulement
const summaryLine = computed(() => {
  const d = billing.data
  if (!d?.can_view_amounts || d.total == null) return ''
  return t('stg_billing_seats', d.seats) + ' · ' + t('stg_billing_total', { amount: money(d.total) })
})

// « Prochain prélèvement : 397,50 € le 21 sept. 2026 · dont remise 397,50 € » — Stripe réel seulement
const upcomingLine = computed(() => {
  const u = billing.data?.upcoming
  if (!billing.canViewAmounts || !u || u.total == null) return ''
  let line = t('stg_billing_next', { amount: money(u.total), date: fmtDate(u.date) })
  if (u.discount > 0) line += ' · ' + t('stg_billing_discount', { amount: money(u.discount) })
  return line
})

// Statut : celui de Stripe quand il existe, sinon les états profil/org existants
const statusLabel = computed(() => {
  const s = billing.data?.status
  if (s === 'past_due' || s === 'unpaid') return t('stg_billing_past_due')
  if (s === 'trialing') return t('stg_billing_trialing', { date: fmtDate(billing.data.period_end) })
  if (s === 'active') return t('stg_plan_active')
  if (s === 'canceled' || s === 'incomplete_expired') return t('stg_plan_none')
  if (auth.hasActiveSubscription) return t('stg_plan_active')
  if (auth.isOnBetaAccess) return t('stg_beta_days', { days: auth.orgTrialDaysLeft })
  if (auth.isOnTrial) return t('stg_trial_days', { days: auth.trialDaysLeft })
  return t('stg_plan_none')
})
const statusClass = computed(() => {
  const s = billing.data?.status
  if (s === 'past_due' || s === 'unpaid') return 'alert'
  if (s === 'trialing' || (!s && (auth.isOnTrial || auth.isOnBetaAccess))) return 'trial'
  if (s === 'active' || (!s && auth.hasActiveSubscription)) return 'active'
  return ''
})

function gridPrice(planKey) {
  if (planKey === 'enterprise') return t('plan_enterprise_price')
  return money(billing.data?.prices?.[planKey] ?? null)
}

// CR-3 : liens via source unique par environnement + client_reference_id
// (seule clé de mapping utilisateur côté webhook Stripe)
const starterUrl = computed(() => stripeCheckoutUrl('billing', 'starter', { email: email.value, userId: auth.user?.id }))
const growthUrl = computed(() => stripeCheckoutUrl('billing', 'growth', { email: email.value, userId: auth.user?.id }))
const eliteUrl = computed(() => stripeCheckoutUrl('billing', 'elite', { email: email.value, userId: auth.user?.id }))

const plans = computed(() => [
  { key: 'starter', name: 'Starter', featured: false, url: starterUrl.value, features: ['stg_plan_starter_f1', 'stg_plan_starter_f2', 'stg_plan_starter_f3'] },
  { key: 'growth', name: 'Growth', featured: true, url: growthUrl.value, features: ['stg_plan_growth_f1', 'stg_plan_growth_f2', 'stg_plan_growth_f3'] },
  { key: 'elite', name: 'Elite', featured: false, url: eliteUrl.value, features: ['stg_plan_elite_f1', 'stg_plan_elite_f2', 'stg_plan_elite_f3'] },
  // PLANS-ENTERPRISE (2.3, D2 27/08) : même offre que la landing — sur devis, contact direct
  { key: 'enterprise', name: 'Enterprise', featured: false, url: 'mailto:contact@scalyo.app', features: ['stg_plan_enterprise_f1', 'stg_plan_enterprise_f2', 'stg_plan_enterprise_f3'] },
])

function getPlanButtonLabel(planKey) {
  if (auth.currentPlan === planKey) return t('stg_plan_current')
  if (planKey === 'enterprise') return t('stg_plan_contact')
  const tiers = { starter: 0, growth: 1, elite: 2, enterprise: 3 }
  const current = tiers[auth.currentPlan] || 0
  const target = tiers[planKey] || 0
  return target > current ? t('stg_plan_upgrade') : t('stg_plan_downgrade')
}

function handlePlanChange(url, plan) {
  if (auth.currentPlan === plan) return
  if (url.startsWith('mailto:')) { window.location.href = url; return }
  window.open(url, '_blank')
}

async function openPortal() {
  portalLoading.value = true
  portalError.value = false
  try {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session?.access_token) return

    const res = await fetch('/api/stripe/portal', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + session.access_token,
      },
    })
    const data = await res.json()
    if (res.ok && data.url) {
      window.open(data.url, '_blank')
    } else {
      portalError.value = true
    }
  } catch {
    portalError.value = true
  } finally {
    portalLoading.value = false
  }
}
</script>

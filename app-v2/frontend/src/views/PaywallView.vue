<template>
  <div class="paywall-page">
    <div class="pw-card">
      <div class="pw-logo">
        <ScalyoLogo :size="40" />
        <span class="pw-brand">Scalyo</span>
      </div>

      <div class="pw-icon">{{ isUpgrade ? '🔓' : '⏰' }}</div>
      <h1 class="pw-title">{{ isUpgrade ? t('paywall_upgrade_title', { plan: requiredPlanLabel }) : t('paywall_title') }}</h1>
      <p class="pw-sub">{{ isUpgrade ? t('paywall_upgrade_subtitle', { plan: requiredPlanLabel }) : t('paywall_subtitle') }}</p>

      <div class="pw-plans">
        <!-- Starter -->
        <div class="pw-plan" :class="{ 'pw-plan--featured': isHighlighted('starter') }">
          <div class="pw-plan-icon">⭐</div>
          <div class="pw-plan-name">Starter</div>
          <!-- PRICE-BY-LANG (contract D1, 29/08): ACCOUNT price via /api/billing — never again
               a price chosen by the interface language. Silent API / member → no amount. -->
          <div class="pw-plan-price"><template v-if="priceFor('starter')">{{ priceFor('starter') }}<span>/{{ t('paywall_per_user_month') }}</span></template><template v-else>—</template></div>
          <ul>
            <li>✓ {{ t('plan_feat_3users') }}</li>
            <li>✓ {{ t('plan_feat_50clients') }}</li>
            <li>✓ {{ t('plan_feat_dashboard_tasks_matrix') }}</li>
            <li>✓ {{ t('plan_feat_coach_chat') }}</li>
            <li>✓ {{ t('plan_feat_templates_copil') }}</li>
            <li>✓ {{ t('plan_feat_wellbeing_private') }}</li>
          </ul>
          <a v-if="!isMember" :href="starterUrl" target="_blank" class="btn-plan btn-starter">
            {{ t('paywall_choose') }} →
          </a>
        </div>
        <!-- Growth -->
        <div class="pw-plan" :class="{ 'pw-plan--featured': isHighlighted('growth') }">
          <div v-if="isHighlighted('growth')" class="pw-popular">{{ isUpgrade ? t('paywall_unlocks') : t('register_most_popular') }}</div>
          <div class="pw-plan-icon">🚀</div>
          <div class="pw-plan-name">Growth</div>
          <div class="pw-plan-price"><template v-if="priceFor('growth')">{{ priceFor('growth') }}<span>/{{ t('paywall_per_user_month') }}</span></template><template v-else>—</template></div>
          <ul>
            <li>✓ {{ t('plan_feat_7users') }}</li>
            <li>✓ {{ t('plan_feat_unlimited_clients') }}</li>
            <li>✓ {{ t('plan_feat_all_starter_resources') }}</li>
            <li>✓ {{ t('plan_feat_import') }}</li>
            <li>✓ {{ t('plan_feat_playbooks_manual') }}</li>
            <li>✓ {{ t('plan_feat_dashboard_advanced') }}</li>
          </ul>
          <a v-if="!isMember" :href="growthUrl" target="_blank" class="btn-plan btn-growth">
            {{ t('paywall_choose') }} →
          </a>
        </div>
        <!-- Elite -->
        <div class="pw-plan" :class="{ 'pw-plan--featured': isHighlighted('elite') }">
          <div v-if="isHighlighted('elite') && isUpgrade" class="pw-popular">{{ t('paywall_unlocks') }}</div>
          <div class="pw-plan-icon">🏆</div>
          <div class="pw-plan-name">Elite</div>
          <div class="pw-plan-price"><template v-if="priceFor('elite')">{{ priceFor('elite') }}<span>/{{ t('paywall_per_user_month') }}</span></template><template v-else>—</template></div>
          <ul>
            <li>✓ {{ t('plan_feat_24users') }}</li>
            <li>✓ {{ t('plan_feat_all_growth') }}</li>
            <li>✓ {{ t('plan_feat_playbooks_ia') }}</li>
            <li>✓ {{ t('plan_feat_email_studio_resend') }}</li>
            <li>✓ {{ t('plan_feat_okr') }}</li>
            <li>✓ {{ t('plan_feat_roadmap') }}</li>
          </ul>
          <a v-if="!isMember" :href="eliteUrl" target="_blank" class="btn-plan btn-elite">
            {{ t('paywall_choose') }} →
          </a>
        </div>
      </div>

      <!-- PRICE-BY-LANG D2: member → no amounts, no CTA, explicit message -->
      <p v-if="isMember" class="pw-note">{{ t('paywall_owner_only') }}</p>
      <!-- D1: the Payment Links decide the final price — stated explicitly -->
      <p v-else-if="hasAmounts" class="pw-note">{{ t('paywall_stripe_final') }}</p>

      <button class="btn-logout" @click="handleLogout">{{ t('paywall_logout') }}</button>
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
import { stripeCheckoutUrl } from '@/config/stripeLinks'

const { t } = useI18n({ useScope: 'global' })
const router = useRouter()
const route = useRoute()
const auth = useAuthStore()

// PRICE-BY-LANG (contract approved 29/08, D1/D2/D3): the price comes from /api/billing
// (grid in the ACCOUNT currency, Stripe data if subscribed) — no price on the front end any more.
// Silent API → no amount, CTAs still active (the real price is on the Stripe page).
const billing = ref(null)
onMounted(async () => {
  try {
    const token = (await supabase.auth.getSession()).data.session?.access_token
    if (!token) return
    const resp = await fetch('/api/billing', { headers: { Authorization: 'Bearer ' + token } })
    if (resp.ok) billing.value = await resp.json()
  } catch (_) { /* defensive: amounts missing, never blocking */ }
})
// D2: member/viewer — the API returns no amounts (can_view_amounts:false)
const isMember = computed(() => billing.value?.can_view_amounts === false)
const hasAmounts = computed(() => !!(billing.value?.prices && billing.value?.currency))
function priceFor(plan) {
  if (!hasAmounts.value) return null
  const v = billing.value.prices[plan]
  if (v == null) return null
  return fmtCurrency(v, { currency: billing.value.currency })
}

// Workstream A — "upgrade" mode (gated module) vs "expired trial"
const isUpgrade = computed(() => route.query.reason === 'upgrade')
// Plan that unlocks the requested module (single source CR-2: resources=Growth; okr/roadmap/email/notif=Elite)
const MODULE_PLAN = { resources: 'growth', import: 'growth', playbook: 'growth', email: 'elite', notif: 'elite', okr: 'elite', roadmap: 'elite' }
const requiredPlan = computed(() => MODULE_PLAN[route.query.module] || 'growth')
const requiredPlanLabel = computed(() => requiredPlan.value.charAt(0).toUpperCase() + requiredPlan.value.slice(1))
function isHighlighted(plan) { return isUpgrade.value ? plan === requiredPlan.value : plan === 'growth' }

const email = computed(() => auth.user?.email || '')
// CR-3: links via a single source per environment (client_reference_id preserved)
const starterUrl = computed(() => stripeCheckoutUrl('checkout', 'starter', { email: email.value, userId: auth.user?.id }))
const growthUrl = computed(() => stripeCheckoutUrl('checkout', 'growth', { email: email.value, userId: auth.user?.id }))
const eliteUrl = computed(() => stripeCheckoutUrl('checkout', 'elite', { email: email.value, userId: auth.user?.id }))

async function handleLogout() {
  await auth.logout()
  router.push('/login')
}
</script>

<style scoped>
.paywall-page { min-height:100vh;display:flex;align-items:center;justify-content:center;background:linear-gradient(135deg,#f5f3ff,#ede9fe);padding:24px; }
.pw-card { background-color: var(--bg-card);border-radius:24px;padding:48px 40px;max-width:860px;width:100%;box-shadow:0 24px 80px rgba(124,58,237,0.12);text-align:center; }
.pw-logo { display:flex;align-items:center;justify-content:center;gap:10px;margin-bottom:24px; }
.pw-brand { font-size:1.3rem;font-weight:800;color:#7c3aed; }
.pw-icon { font-size:3rem;margin-bottom:12px; }
.pw-title { font-size:1.6rem;font-weight:800;margin-bottom:8px;color:#111827; }
.pw-sub { font-size:0.9rem;color:#6b7280;margin-bottom:32px;line-height:1.6; }
.pw-plans { display:grid;grid-template-columns:repeat(3,1fr);gap:16px;margin-bottom:28px; }
.pw-plan { border:2px solid var(--border-color);border-radius:16px;padding:24px 16px;display:flex;flex-direction:column;align-items:center;gap:8px;position:relative; }
.pw-plan--featured { border-color:#7c3aed;box-shadow:0 4px 20px rgba(124,58,237,0.15); }
.pw-popular { position:absolute;top:-12px;left:50%;transform:translateX(-50%);background:#7c3aed;color:#fff;font-size:0.7rem;font-weight:700;padding:3px 12px;border-radius:20px;white-space:nowrap; }
.pw-plan-icon { font-size:1.6rem; }
.pw-plan-name { font-size:0.95rem;font-weight:800; }
.pw-plan-price { font-size:1.5rem;font-weight:800;color:#7c3aed; }
.pw-plan-price span { font-size:0.78rem;color:#6b7280;font-weight:400; }
.pw-plan ul { list-style:none;padding:0;margin:0;text-align:left;width:100%; }
.pw-plan ul li { font-size:0.78rem;color: var(--text-primary);padding:2px 0; }
.btn-plan { display:block;width:100%;text-align:center;text-decoration:none;padding:10px;border-radius:10px;font-size:0.85rem;font-weight:700;margin-top:8px;transition:all 0.2s; }
.btn-starter { background:#ede9fe;color:#5b21b6; }
.btn-starter:hover { background:#7c3aed;color:#fff; }
.btn-growth { background:#7c3aed;color:#fff; }
.btn-growth:hover { background:#6d28d9;transform:translateY(-1px); }
.btn-elite { background:#1f2937;color:#fff; }
.btn-elite:hover { background:#111827;transform:translateY(-1px); }
.pw-note { font-size:0.78rem;color:#6b7280;margin:-12px 0 20px; }
.btn-logout { background:none;border:1px solid var(--border-color);color:#6b7280;padding:10px 24px;border-radius:10px;font-size:0.85rem;cursor:pointer;transition:all 0.2s; }
.btn-logout:hover { border-color:#ef4444;color:#ef4444; }
@media(max-width:640px) { .pw-plans { grid-template-columns:1fr; } .pw-card { padding:32px 20px; } }
</style>
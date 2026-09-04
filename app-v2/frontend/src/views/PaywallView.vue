<template>
  <div class="paywall_page">
    <div class="paywall_card">
      <div class="paywall_logo">
        <ScalyoLogo :size="40" />
        <span class="paywall_brand">Scalyo</span>
      </div>

      <div class="paywall_icon">{{ isUpgrade ? '🔓' : '⏰' }}</div>
      <h1 class="paywall_title">{{ isUpgrade ? t('paywall_upgrade_title', { plan: requiredPlanLabel }) : t('paywall_title') }}</h1>
      <p class="paywall_sub">{{ isUpgrade ? t('paywall_upgrade_subtitle', { plan: requiredPlanLabel }) : t('paywall_subtitle') }}</p>

      <div class="paywall_plans">
        <!-- Starter -->
        <div class="paywall_plan" :class="{ 'paywall_plan_featured': isHighlighted('starter') }">
          <div class="paywall_plan_icon">⭐</div>
          <div class="paywall_plan_name">Starter</div>
          <!-- PRICE-BY-LANG (contract D1, 29/08): ACCOUNT price via /api/billing — never again
               a price chosen by the interface language. Silent API / member → no amount. -->
          <div class="paywall_plan_price"><template v-if="priceFor('starter')">{{ priceFor('starter') }}<span>/{{ t('paywall_per_user_month') }}</span></template><template v-else>—</template></div>
          <ul>
            <li>✓ {{ t('plan_feat_3users') }}</li>
            <li>✓ {{ t('plan_feat_50clients') }}</li>
            <li>✓ {{ t('plan_feat_dashboard_tasks_matrix') }}</li>
            <li>✓ {{ t('plan_feat_coach_chat') }}</li>
            <li>✓ {{ t('plan_feat_templates_copil') }}</li>
            <li>✓ {{ t('plan_feat_wellbeing_private') }}</li>
          </ul>
          <a v-if="!isMember" :href="starterUrl" target="_blank" class="button_plan button_starter">
            {{ t('paywall_choose') }} →
          </a>
        </div>
        <!-- Growth -->
        <div class="paywall_plan" :class="{ 'paywall_plan_featured': isHighlighted('growth') }">
          <div v-if="isHighlighted('growth')" class="paywall_popular">{{ isUpgrade ? t('paywall_unlocks') : t('register_most_popular') }}</div>
          <div class="paywall_plan_icon">🚀</div>
          <div class="paywall_plan_name">Growth</div>
          <div class="paywall_plan_price"><template v-if="priceFor('growth')">{{ priceFor('growth') }}<span>/{{ t('paywall_per_user_month') }}</span></template><template v-else>—</template></div>
          <ul>
            <li>✓ {{ t('plan_feat_7users') }}</li>
            <li>✓ {{ t('plan_feat_unlimited_clients') }}</li>
            <li>✓ {{ t('plan_feat_all_starter_resources') }}</li>
            <li>✓ {{ t('plan_feat_import') }}</li>
            <li>✓ {{ t('plan_feat_playbooks_manual') }}</li>
            <li>✓ {{ t('plan_feat_dashboard_advanced') }}</li>
          </ul>
          <a v-if="!isMember" :href="growthUrl" target="_blank" class="button_plan button_growth">
            {{ t('paywall_choose') }} →
          </a>
        </div>
        <!-- Elite -->
        <div class="paywall_plan" :class="{ 'paywall_plan_featured': isHighlighted('elite') }">
          <div v-if="isHighlighted('elite') && isUpgrade" class="paywall_popular">{{ t('paywall_unlocks') }}</div>
          <div class="paywall_plan_icon">🏆</div>
          <div class="paywall_plan_name">Elite</div>
          <div class="paywall_plan_price"><template v-if="priceFor('elite')">{{ priceFor('elite') }}<span>/{{ t('paywall_per_user_month') }}</span></template><template v-else>—</template></div>
          <ul>
            <li>✓ {{ t('plan_feat_24users') }}</li>
            <li>✓ {{ t('plan_feat_all_growth') }}</li>
            <li>✓ {{ t('plan_feat_playbooks_ia') }}</li>
            <li>✓ {{ t('plan_feat_email_studio_resend') }}</li>
            <li>✓ {{ t('plan_feat_okr') }}</li>
            <li>✓ {{ t('plan_feat_roadmap') }}</li>
          </ul>
          <a v-if="!isMember" :href="eliteUrl" target="_blank" class="button_plan button_elite">
            {{ t('paywall_choose') }} →
          </a>
        </div>
      </div>

      <!-- PRICE-BY-LANG D2: member → no amounts, no CTA, explicit message -->
      <p v-if="isMember" class="paywall_note">{{ t('paywall_owner_only') }}</p>
      <!-- D1: the Payment Links decide the final price — stated explicitly -->
      <p v-else-if="hasAmounts" class="paywall_note">{{ t('paywall_stripe_final') }}</p>

      <button class="button_logout" @click="handleLogout">{{ t('paywall_logout') }}</button>
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
.paywall_page { min-height:100vh;display:flex;align-items:center;justify-content:center;background:linear-gradient(135deg,#f5f3ff,#ede9fe);padding:24px; }
.paywall_card { background-color: var(--bg-card);border-radius:24px;padding:48px 40px;max-width:860px;width:100%;box-shadow:0 24px 80px rgba(124,58,237,0.12);text-align:center; }
.paywall_logo { display:flex;align-items:center;justify-content:center;gap:10px;margin-bottom:24px; }
.paywall_brand { font-size:1.3rem;font-weight:800;color:#7c3aed; }
.paywall_icon { font-size:3rem;margin-bottom:12px; }
.paywall_title { font-size:1.6rem;font-weight:800;margin-bottom:8px;color:#111827; }
.paywall_sub { font-size:0.9rem;color:#6b7280;margin-bottom:32px;line-height:1.6; }
.paywall_plans { display:grid;grid-template-columns:repeat(3,1fr);gap:16px;margin-bottom:28px; }
.paywall_plan { border:2px solid var(--border-color);border-radius:16px;padding:24px 16px;display:flex;flex-direction:column;align-items:center;gap:8px;position:relative; }
.paywall_plan_featured { border-color:#7c3aed;box-shadow:0 4px 20px rgba(124,58,237,0.15); }
.paywall_popular { position:absolute;top:-12px;left:50%;transform:translateX(-50%);background:#7c3aed;color:#fff;font-size:0.7rem;font-weight:700;padding:3px 12px;border-radius:20px;white-space:nowrap; }
.paywall_plan_icon { font-size:1.6rem; }
.paywall_plan_name { font-size:0.95rem;font-weight:800; }
.paywall_plan_price { font-size:1.5rem;font-weight:800;color:#7c3aed; }
.paywall_plan_price span { font-size:0.78rem;color:#6b7280;font-weight:400; }
.paywall_plan ul { list-style:none;padding:0;margin:0;text-align:left;width:100%; }
.paywall_plan ul li { font-size:0.78rem;color: var(--text-primary);padding:2px 0; }
.button_plan { display:block;width:100%;text-align:center;text-decoration:none;padding:10px;border-radius:10px;font-size:0.85rem;font-weight:700;margin-top:8px;transition:all 0.2s; }
.button_starter { background:#ede9fe;color:#5b21b6; }
.button_starter:hover { background:#7c3aed;color:#fff; }
.button_growth { background:#7c3aed;color:#fff; }
.button_growth:hover { background:#6d28d9;transform:translateY(-1px); }
.button_elite { background:#1f2937;color:#fff; }
.button_elite:hover { background:#111827;transform:translateY(-1px); }
.paywall_note { font-size:0.78rem;color:#6b7280;margin:-12px 0 20px; }
.button_logout { background:none;border:1px solid var(--border-color);color:#6b7280;padding:10px 24px;border-radius:10px;font-size:0.85rem;cursor:pointer;transition:all 0.2s; }
.button_logout:hover { border-color:#ef4444;color:#ef4444; }
@media(max-width:640px) { .paywall_plans { grid-template-columns:1fr; } .paywall_card { padding:32px 20px; } }
</style>
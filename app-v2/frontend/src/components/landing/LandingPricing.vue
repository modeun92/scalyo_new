<template>
  <section id="pricing" class="pricing-section">
    <div class="container">
      <div class="section-header anim-section" data-anim="fade-up">
        <span class="section-tag">{{ t('pricing_tag') }}</span>
        <h2 v-html="t('pricing_h2')"></h2>
        <p class="pricing-sub">{{ t('pricing_sub') }}</p>
      </div>

      <div class="plans-grid anim-section" data-anim="fade-up">
        <!-- Starter -->
        <div class="plan-card">
          <div class="plan-top">
            <div class="plan-name">STARTER</div>
            <div class="plan-price-wrap">
              <div class="plan-price"><span class="currency">{{ t('plan_currency') }}</span>{{ t('plan_starter_price') }}</div>
              <div class="plan-period">{{ t('plan_per_user') }}</div>
            </div>
            <div class="plan-desc">{{ t('plan_starter_desc') }}</div>
          </div>
          <ul class="plan-features">
            <li>&#10003; {{ t('feat_s1') }}</li>
            <li>&#10003; {{ t('feat_s2') }}</li>
            <li>&#10003; {{ t('feat_s3') }}</li>
            <li>&#10003; {{ t('feat_s4') }}</li>
            <li>&#10003; {{ t('feat_s5') }}</li>
            <li>&#10003; {{ t('feat_s6') }}</li>
          </ul>
          <a :href="stripeUrl('starter')" target="_blank" rel="noopener" class="btn-outline plan-btn">{{ t('cta_trial') }}</a>
        </div>

        <!-- Growth -->
        <div class="plan-card">
          <div class="popular-badge">&#11088; {{ t('badge_popular') }}</div>
          <div class="plan-top">
            <div class="plan-name">GROWTH</div>
            <div class="plan-price-wrap">
              <div class="plan-price"><span class="currency">{{ t('plan_currency') }}</span>{{ t('plan_growth_price') }}</div>
              <div class="plan-period">{{ t('plan_per_user') }}</div>
            </div>
            <div class="plan-desc">{{ t('plan_growth_desc') }}</div>
          </div>
          <ul class="plan-features">
            <li>&#10003; {{ t('feat_g1') }}</li>
            <li>&#10003; {{ t('feat_g2') }}</li>
            <li>&#10003; {{ t('feat_g3') }}</li>
            <li>&#10003; {{ t('feat_g4') }}</li>
            <li>&#10003; {{ t('feat_g5') }}</li>
            <li>&#10003; {{ t('feat_g6') }}</li>
          </ul>
          <a :href="stripeUrl('growth')" target="_blank" rel="noopener" class="btn-primary plan-btn">{{ t('cta_trial') }}</a>
        </div>

        <!-- Scale / Elite -->
        <div class="plan-card elite-featured">
          <div class="plan-top">
            <div class="plan-name">ELITE</div>
            <div class="plan-price-wrap">
              <div class="plan-price"><span class="currency">{{ t('plan_currency') }}</span>{{ t('plan_elite_price') }}</div>
              <div class="plan-period">{{ t('plan_per_user') }}</div>
            </div>
            <div class="plan-desc">{{ t('plan_elite_desc') }}</div>
          </div>
          <ul class="plan-features">
            <li>&#10003; {{ t('feat_sc1') }}</li>
            <li>&#10003; {{ t('feat_sc2') }}</li>
            <li>&#10003; {{ t('feat_sc3') }}</li>
            <li>&#10003; {{ t('feat_sc4') }}</li>
            <li>&#10003; {{ t('feat_sc5') }}</li>
            <li>&#10003; {{ t('feat_sc6') }}</li>
          </ul>
          <a :href="stripeUrl('elite')" target="_blank" rel="noopener" class="btn-outline plan-btn">{{ t('cta_trial') }}</a>
        </div>

        <!-- Enterprise -->
        <div class="plan-card">
          <div class="plan-top">
            <div class="plan-name">ENTERPRISE</div>
            <div class="plan-price-wrap">
              <div class="plan-price plan-price-custom">{{ t('plan_custom') }}</div>
              <div class="plan-period">{{ t('plan_viewers') }}</div>
            </div>
            <div class="plan-desc">{{ t('plan_enterprise_desc') }}</div>
          </div>
          <ul class="plan-features">
            <li>&#10003; {{ t('feat_e1') }}</li>
            <li>&#10003; {{ t('feat_e2') }}</li>
            <li>&#10003; {{ t('feat_e3') }}</li>
            <li>&#10003; {{ t('feat_e4') }}</li>
            <li>&#10003; {{ t('feat_e5') }}</li>
            <li>&#10003; {{ t('feat_e6') }}</li>
          </ul>
          <a href="mailto:contact@scalyo.app" class="btn-outline plan-btn">{{ t('cta_contact') }}</a>
        </div>
      </div>

      <p class="plan-footnote" v-html="t('plan_footnote')"></p>
    </div>
    <p class="pricing-privacy-note">🔒 {{ t('pricing_privacy_note') }}</p>
    </section>
</template>

<script setup>
import { useAuthStore } from '@/stores/auth'
import { stripeCheckoutUrl } from '@/config/stripeLinks'

const props = defineProps({
  t: { type: Function, required: true }
})

const authStore = useAuthStore()

// CR-3 : liens via source unique par environnement + client_reference_id
// quand l'utilisateur est connecté (mapping webhook)
function stripeUrl(plan) {
  return stripeCheckoutUrl('checkout', plan, { email: authStore.user?.email, userId: authStore.user?.id })
}
</script>

<style scoped>
.elite-featured { position: relative; border: 2px solid var(--primary, #6366f1); transform: scale(1.04); box-shadow: 0 8px 40px rgba(99,102,241,.18), 0 0 0 1px rgba(99,102,241,.08); z-index: 2; }
.elite-featured::before { content: ''; position: absolute; inset: -2px; border-radius: inherit; background: linear-gradient(135deg, #6366f1, #8b5cf6, #a78bfa); z-index: -1; padding: 2px; -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0); -webkit-mask-composite: xor; mask-composite: exclude; }
.pricing-privacy-note { text-align: center; color: var(--text-secondary, #6b7280); font-size: 0.85rem; margin-top: 1.5rem; padding: 0 1rem; }
@media (max-width: 768px) { .elite-featured { transform: none; } }
</style>
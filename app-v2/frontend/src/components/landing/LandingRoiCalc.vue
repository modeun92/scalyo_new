<template>
  <section id="roi" class="roi-section">
    <div class="container">
      <div class="section-header anim-section" data-anim="fade-up">
        <span class="section-tag">{{ t('roi_tag') }}</span>
        <h2 v-html="t('roi_h2')"></h2>
        <p class="section-sub">{{ t('roi_sub') }}</p>
      </div>

      <div class="roi-grid anim-section" data-anim="fade-up">
        <div class="roi-sliders">
          <div class="roi-field">
            <label>{{ t('roi_lbl_csm') }}: <strong>{{ roiCsms }}</strong></label>
            <input type="range" v-model.number="roiCsms" min="1" max="50" />
          </div>
          <div class="roi-field">
            <label>{{ t('roi_lbl_acc') }}: <strong>{{ roiAcc }}</strong></label>
            <input type="range" v-model.number="roiAcc" min="5" max="200" />
          </div>
          <div class="roi-field">
            <label>{{ t('roi_lbl_arr') }}: <strong>{{ fmtArr }}</strong></label>
            <input type="range" v-model.number="roiArr" :min="cur.arr.min" :max="cur.arr.max" :step="cur.arr.step" />
          </div>
          <div class="roi-field">
            <label>{{ t('roi_lbl_churn') }}: <strong>{{ roiChurn }}%</strong></label>
            <input type="range" v-model.number="roiChurn" min="1" max="30" />
          </div>
        </div>

        <div class="roi-results">
        <div class="roi-main-result">
          <div class="roi-big">{{ roiSaved }}</div>
          <div class="roi-desc">{{ t('roi_saved') }}</div>
        </div>
        <div class="roi-details">
          <div class="roi-detail">
            <div class="roi-dl">{{ t('roi_time') }}</div>
            <div class="roi-dv green">{{ roiTimeSaved }}{{ t('roi_time_unit') }}</div>
          </div>
          <div class="roi-detail">
            <div class="roi-dl">{{ t('roi_multiplier') }}</div>
            <div class="roi-dv purple">x{{ roiMultiplier }}</div>
          </div>
        </div>
        <div class="roi-plan">
          <div class="roi-plan-label">{{ t('roi_recommendation') }}</div>
          <div class="roi-plan-value">{{ roiRecommendedPlan }}</div>
        </div>
      </div>
      </div>
    </div>
  </section>
</template>

<script setup>
import { ref, computed, watch } from 'vue'

const props = defineProps({
  t: { type: Function, required: true },
  locale: { type: String, default: 'fr' }
})

// Devises alignees sur les prix Stripe reels (functions/api/stripe-webhook.js, PRICE_TO_PLAN) :
// eur 79/119/159 - usd 89/139/189 - krw 139000/209000/279000.
// LandingPage.vue propage les codes fr | en | kr (jamais 'ko').
const CURRENCIES = {
  fr: { symbol: '\u20ac', suffix: true,  tag: 'fr-FR', seat: [79, 119, 159],
        arr: { def: 15000, min: 1000, max: 100000, step: 1000 } },
  en: { symbol: '$',       suffix: false, tag: 'en-US', seat: [89, 139, 189],
        arr: { def: 16000, min: 1000, max: 100000, step: 1000 } },
  kr: { symbol: '\u20a9', suffix: false, tag: 'ko-KR', seat: [139000, 209000, 279000],
        arr: { def: 25000000, min: 2000000, max: 200000000, step: 1000000 } },
}

const cur = computed(() => CURRENCIES[props.locale] || CURRENCIES.fr)

const roiCsms = ref(5)
const roiAcc = ref(30)
const roiArr = ref((CURRENCIES[props.locale] || CURRENCIES.fr).arr.def)
const roiChurn = ref(12)

// Changer de langue change de devise : l'ARR est remis a l'echelle de la nouvelle devise,
// sinon 15 000 EUR deviendrait 15 000 KRW (~10 EUR) et le calcul serait absurde.
watch(() => props.locale, () => { roiArr.value = cur.value.arr.def })

function money(v) {
  const c = cur.value
  const n = v.toLocaleString(c.tag)
  return c.suffix ? n + '\u00a0' + c.symbol : c.symbol + n
}

const roiTotalArr = computed(() => roiCsms.value * roiAcc.value * roiArr.value)
const roiChurnCost = computed(() => Math.round(roiTotalArr.value * roiChurn.value / 100))
const roiSavedRaw = computed(() => Math.round(roiChurnCost.value * 0.15))

const fmtArr = computed(() => money(roiArr.value))
const roiSaved = computed(() => money(roiSavedRaw.value))
const roiTimeSaved = computed(() => roiCsms.value * 6)

const seatCost = computed(() => {
  const s = cur.value.seat
  return roiCsms.value <= 3 ? s[0] : roiCsms.value <= 7 ? s[1] : s[2]
})
const roiMultiplier = computed(() =>
  Math.max(1, Math.round(roiSavedRaw.value / (seatCost.value * roiCsms.value * 12)))
)
const roiRecommendedPlan = computed(() => {
  if (roiCsms.value <= 3) return props.t('roi_plan_starter')
  if (roiCsms.value <= 7) return props.t('roi_plan_growth')
  return props.t('roi_plan_elite')
})
</script>


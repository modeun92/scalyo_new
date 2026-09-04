<template>
  <transition name="fade">
    <div v-if="show" class="onboarding_overlay">
      <div class="onboarding_modal">
        <div class="onboarding_progress">
          <div class="onboarding_bar" :style="{ width: progress + '%' }" />
        </div>

        <div class="onboarding_step" v-if="step === 0">
          <div class="onboarding_emoji">👋</div>
          <h2>{{ t('ob_welcome_title') }}</h2>
          <p>{{ t('ob_welcome_desc') }}</p>
          <button class="onboarding_button_primary" @click="step++">{{ t('ob_start') }}</button>
        </div>

        <div class="onboarding_step" v-if="step === 1">
          <h3>{{ t('ob_role_title') }}</h3>
          <div class="onboarding_options">
            <button
              v-for="opt in profileStore.ROLE_OPTIONS"
              :key="opt.value"
              class="onboarding_option"
              :class="{ selected: form.role === opt.value }"
              @click="form.role = opt.value"
            >{{ t(opt.labelKey) }}</button>
          </div>
          <input
            v-if="form.role === 'other'"
            v-model="form.role_custom"
            class="onboarding_input"
            :placeholder="t('ob_role_custom')"
          />
          <div class="onboarding_navigation">
            <button class="onboarding_button_ghost" @click="step--">←</button>
            <button class="onboarding_button_primary" @click="step++" :disabled="!form.role">{{ t('ob_next') }}</button>
          </div>
        </div>

        <div class="onboarding_step" v-if="step === 2">
          <h3>{{ t('ob_seniority_title') }}</h3>
          <div class="onboarding_options">
            <button
              v-for="opt in profileStore.SENIORITY_OPTIONS"
              :key="opt.value"
              class="onboarding_option"
              :class="{ selected: form.seniority === opt.value }"
              @click="form.seniority = opt.value"
            >{{ t(opt.labelKey) }}</button>
          </div>
          <div class="onboarding_navigation">
            <button class="onboarding_button_ghost" @click="step--">←</button>
            <button class="onboarding_button_primary" @click="step++">{{ t('ob_next') }}</button>
          </div>
        </div>

        <div class="onboarding_step" v-if="step === 3">
          <h3>{{ t('ob_industry_title') }}</h3>
          <div class="onboarding_options">
            <button
              v-for="opt in profileStore.INDUSTRY_OPTIONS"
              :key="opt.value"
              class="onboarding_option"
              :class="{ selected: form.industry === opt.value }"
              @click="form.industry = opt.value"
            >{{ t(opt.labelKey) }}</button>
          </div>
          <input
            v-if="form.industry === 'other'"
            v-model="form.industry_custom"
            class="onboarding_input"
            :placeholder="t('ob_industry_custom')"
          />
          <div class="onboarding_navigation">
            <button class="onboarding_button_ghost" @click="step--">←</button>
            <button class="onboarding_button_primary" @click="step++">{{ t('ob_next') }}</button>
          </div>
        </div>

        <div class="onboarding_step" v-if="step === 4">
          <h3>{{ t('ob_company_title') }}</h3>
          <div class="onboarding_options">
            <button
              v-for="opt in profileStore.SIZE_OPTIONS"
              :key="opt.value"
              class="onboarding_option"
              :class="{ selected: form.company_size === opt.value }"
              @click="form.company_size = opt.value"
            >{{ t(opt.labelKey) }}</button>
          </div>
          <label class="onboarding_label">{{ t('ob_portfolio_size') }}</label>
          <input v-model.number="form.portfolio_size" type="number" class="onboarding_input" min="0" :placeholder="t('ob_portfolio_placeholder')" />
          <div class="onboarding_navigation">
            <button class="onboarding_button_ghost" @click="step--">←</button>
            <button class="onboarding_button_primary" @click="step++">{{ t('ob_next') }}</button>
          </div>
        </div>

        
        <div class="onboarding_step" v-if="step === 5">
          <div class="onboarding_emoji">🔒</div>
          <h3>{{ t('ob_consent_title') }}</h3>
          <div class="onboarding_consent_items">
            <label class="onboarding_consent_item">
              <input type="checkbox" v-model="form.ai_consent" />
              <div>
                <strong>{{ t('ob_consent_ai_label') }}</strong>
                <p>{{ t('ob_consent_ai_desc') }}</p>
              </div>
            </label>
            <label class="onboarding_consent_item">
              <input type="checkbox" v-model="form.analytics_consent" />
              <div>
                <strong>{{ t('ob_consent_analytics_label') }}</strong>
                <p>{{ t('ob_consent_analytics_desc') }}</p>
              </div>
            </label>
          </div>
          <p class="onboarding_consent_legal">{{ t('ob_consent_legal') }}</p>
          <div class="onboarding_navigation">
            <button class="onboarding_button_ghost" @click="step--">←</button>
            <button class="onboarding_button_primary" @click="step++" :disabled="!form.ai_consent">{{ t('ob_next') }}</button>
          </div>
        </div>

        <div class="onboarding_step" v-if="step === 6">
          <h3>{{ t('ob_goals_title') }}</h3>
          <p class="onboarding_hint">{{ t('ob_goals_hint') }}</p>
          <div class="onboarding_options">
            <button
              v-for="g in goalOptions"
              :key="g.value"
              class="onboarding_option"
              :class="{ selected: form.goals.includes(g.value) }"
              @click="toggleGoal(g.value)"
            >{{ t(g.labelKey) }}</button>
          </div>
          <div class="onboarding_navigation">
            <button class="onboarding_button_ghost" @click="step--">←</button>
            <button class="onboarding_button_primary" @click="submit" :disabled="saving">{{ saving ? '...' : t('ob_finish') }}</button>
          </div>
        </div>
      </div>
    </div>
  </transition>
</template>

<script setup>
import { ref, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useProfileStore } from '@/stores/profile'

const { t } = useI18n({ useScope: 'global' })
const profileStore = useProfileStore()

const show = computed(() => profileStore.profile && !profileStore.isComplete)
const progress = computed(() => Math.round((step.value / 6) * 100))
const step = ref(0)
const saving = ref(false)

const form = ref({
  role: 'csm',
  role_custom: '',
  seniority: 'mid',
  industry: '',
  industry_custom: '',
  company_size: 'smb',
  portfolio_size: 0,
  goals: [],
  ai_consent: false,
  analytics_consent: false,
  consent_date: null,
})

const goalOptions = [
  { value: 'reduce_churn', labelKey: 'ob_goal_churn' },
  { value: 'increase_nrr', labelKey: 'ob_goal_nrr' },
  { value: 'improve_onboarding', labelKey: 'ob_goal_onboarding' },
  { value: 'scale_team', labelKey: 'ob_goal_scale' },
  { value: 'automate_playbooks', labelKey: 'ob_goal_automate' },
  { value: 'better_reporting', labelKey: 'ob_goal_reporting' },
  { value: 'client_satisfaction', labelKey: 'ob_goal_satisfaction' },
  { value: 'expansion_revenue', labelKey: 'ob_goal_expansion' },
]

function toggleGoal(val) {
  const idx = form.value.goals.indexOf(val)
  if (idx >= 0) form.value.goals.splice(idx, 1)
  else form.value.goals.push(val)
}

async function submit() {
  saving.value = true
  await profileStore.save({ ...form.value, consent_date: new Date().toISOString(), onboarding_completed: true })
  saving.value = false
}
</script>

<style scoped>
.onboarding_overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.5); z-index: 9999; display: flex; align-items: center; justify-content: center; backdrop-filter: blur(4px); }
.onboarding_modal { background-color: var(--bg-card); border-radius: 20px; width: 480px; max-width: 92vw; max-height: 90vh; overflow-y: auto; box-shadow: 0 24px 80px rgba(0,0,0,0.2); }
.onboarding_progress { height: 4px; background: var(--border-light); border-radius: 20px 20px 0 0; overflow: hidden; }
.onboarding_bar { height: 100%; background: linear-gradient(90deg, #7c3aed, #a78bfa); transition: width 0.3s ease; }
.onboarding_step { padding: 32px 36px; text-align: center; }
.onboarding_emoji { font-size: 3rem; margin-bottom: 12px; }
.onboarding_step h2 { font-size: 1.3rem; font-weight: 700; margin-bottom: 8px; }
.onboarding_step h3 { font-size: 1.1rem; font-weight: 700; margin-bottom: 16px; }
.onboarding_step p { color: var(--text-secondary); font-size: 0.9rem; line-height: 1.5; margin-bottom: 20px; }
.onboarding_hint { color: var(--text-muted); font-size: 0.8rem; margin-bottom: 12px; }
.onboarding_options { display: flex; flex-wrap: wrap; gap: 8px; justify-content: center; margin-bottom: 20px; }
.onboarding_option { padding: 10px 18px; border-radius: 24px; border: 1px solid var(--border); background-color: var(--bg-card); font-size: 0.84rem; color: var(--text-secondary); cursor: pointer; transition: all 0.15s; }
.onboarding_option:hover { border-color: var(--purple); color: var(--purple); }
.onboarding_option.selected { background: var(--purple); color: #fff; border-color: var(--purple); }
.onboarding_label { display: block; text-align: left; font-size: 0.8rem; font-weight: 600; color: var(--text-secondary); margin-bottom: 6px; margin-top: 12px; }
.onboarding_input { width: 100%; padding: 10px 14px; border: 1px solid var(--border); border-radius: 10px; font-size: 0.88rem; outline: none; margin-bottom: 8px; }
.onboarding_input:focus { border-color: var(--purple); }
.onboarding_navigation { display: flex; justify-content: space-between; gap: 12px; margin-top: 16px; }
.onboarding_button_primary { padding: 12px 28px; border-radius: 24px; background: var(--purple); color: #fff; border: none; font-weight: 600; font-size: 0.88rem; cursor: pointer; transition: opacity 0.15s; }
.onboarding_button_primary:hover { opacity: 0.9; }
.onboarding_button_primary:disabled { opacity: 0.4; cursor: not-allowed; }
.onboarding_button_ghost { padding: 12px 20px; border-radius: 24px; background: none; border: 1px solid var(--border); color: var(--text-secondary); font-size: 0.88rem; cursor: pointer; }
.fade-enter-active, .fade-leave-active { transition: opacity 0.3s; }
.fade-enter-from, .fade-leave-to { opacity: 0; }
.onboarding_consent_items { display: flex; flex-direction: column; gap: 14px; text-align: left; margin-bottom: 16px; }
.onboarding_consent_item { display: flex; gap: 12px; align-items: flex-start; padding: 14px; border: 1px solid var(--border); border-radius: 12px; cursor: pointer; transition: border-color 0.15s; }
.onboarding_consent_item:hover { border-color: var(--purple); }
.onboarding_consent_item input[type="checkbox"] { width: 20px; height: 20px; margin-top: 2px; flex-shrink: 0; accent-color: var(--purple); }
.onboarding_consent_item strong { font-size: 0.88rem; display: block; margin-bottom: 4px; }
.onboarding_consent_item p { font-size: 0.78rem; color: var(--text-muted); line-height: 1.4; margin: 0; }
.onboarding_consent_legal { font-size: 0.72rem; color: var(--text-muted); line-height: 1.5; text-align: left; margin-top: 8px; }
@media (max-width: 500px) { .onboarding_step { padding: 24px 20px; } .onboarding_modal { border-radius: 16px; } }
</style>

<template>
  <div class="onboarding-container">
    <div class="onboarding-progress">
      <div class="progress-bar" :style="{ width: (step / 5) * 100 + '%' }"></div>
    </div>
    <div class="onboarding-header">
      <p class="step-indicator">{{ t('onb_step') }} {{ step }} {{ t('onb_of') }} 5</p>
    </div>
    <div v-if="step === 1" class="onboarding-step">
      <h1>{{ t('onb_title') }}</h1>
      <p class="step-desc">{{ t('onb_s1_desc') }}</p>
      <input v-model="companyName" :placeholder="t('onb_s1_placeholder')" class="onb-input" @keyup.enter="nextStep" />
    </div>
    <div v-if="step === 2" class="onboarding-step">
      <h1>{{ t('onb_s2_title') }}</h1>
      <p class="step-desc">{{ t('onb_s2_desc') }}</p>
      <input v-model="clientName" :placeholder="t('onb_s2_name_placeholder')" class="onb-input" @keyup.enter="nextStep" />
      <div class="health-selector">
        <label>{{ t('onb_s2_health') }}</label>
        <div class="health-dots">
          <button v-for="n in 10" :key="n" :class="['dot', { active: n <= clientHealth }]" @click="clientHealth = n">{{ n }}</button>
        </div>
      </div>
      <p class="skip-hint">{{ t('onb_s2_skip_hint') }}</p>
    </div>
    <div v-if="step === 3" class="onboarding-step">
      <h1>{{ t('onb_s3_title') }}</h1>
      <p class="step-desc">{{ t('onb_s3_desc') }}</p>
      <input v-model="taskTitle" :placeholder="t('onb_s3_task_placeholder')" class="onb-input" @keyup.enter="nextStep" />
      <p class="skip-hint">{{ t('onb_s3_skip_hint') }}</p>
    </div>
    <div v-if="step === 4" class="onboarding-step">
      <h1>{{ t('onb_s4_title') }}</h1>
      <p class="step-desc">{{ t('onb_s4_desc') }}</p>
      <div class="coach-demo">
        <input v-model="coachMessage" :placeholder="t('onb_s4_placeholder')" class="onb-input" @keyup.enter="sendCoachMessage" :disabled="coachLoading" />
        <button class="btn-send" @click="sendCoachMessage" :disabled="!coachMessage.trim() || coachLoading">{{ t('onb_s4_send') }}</button>
      </div>
      <div v-if="coachResponse" class="coach-response" v-html="formatAiText(coachResponse)"></div>
      <p class="skip-hint">{{ t('onb_s4_skip_hint') }}</p>
    </div>
    <div v-if="step === 5" class="onboarding-step onboarding-done">
      <div class="done-icon">✓</div>
      <h1>{{ t('onb_s5_title') }}</h1>
      <p class="step-desc">{{ t('onb_s5_desc') }}</p>
    </div>
    <p v-if="errorMsg" class="onb-error">{{ errorMsg }}</p>
    <div class="onboarding-nav">
      <button v-if="step > minStep && step < 5" class="btn-back" @click="step--">{{ t('onb_back') }}</button>
      <button v-if="canSkip" class="btn-skip" @click="skipStep">{{ t('onb_skip') }}</button>
      <button v-if="step < 5" class="btn-next" @click="nextStep" :disabled="saving">{{ saving ? t('onb_saving') : t('onb_next') }}</button>
      <button v-if="step === 5" class="btn-next btn-finish" @click="finishOnboarding" :disabled="saving">{{ saving ? t('onb_saving') : t('onb_s5_cta') }}</button>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { useClientStore } from '@/stores/clients'
import { useTaskStore } from '@/stores/tasks'
import { askScalyoAI } from '@/utils/askScalyoAI'
import { formatAiText } from '@/utils/sanitize'
import { supabase } from '@/lib/supabase'

const { t } = useI18n({ useScope: 'global' })
const router = useRouter()
const authStore = useAuthStore()
const clientStore = useClientStore()
const taskStore = useTaskStore()

// ONB-ORG : l'étape 1 (nom d'entreprise) est réservée au owner — un invité rejoint une org déjà nommée.
// RLS org_manage (UPDATE owner-only) rendait déjà l'écriture member inopérante ; ici on cesse de la proposer.
const isOwner = (authStore.profile?.org_role || 'owner') === 'owner'
const minStep = isOwner ? 1 : 2
const step = ref(minStep)
const saving = ref(false)
const errorMsg = ref('')
const companyName = ref('')
const clientName = ref('')
const clientHealth = ref(7)
const createdClientId = ref(null)
const taskTitle = ref('')
const coachMessage = ref('')
const coachResponse = ref('')
const coachLoading = ref(false)

const canSkip = computed(() => step.value >= 2 && step.value <= 4)

async function nextStep() {
  errorMsg.value = ''
  saving.value = true
  try {
    if (step.value === 1 && companyName.value.trim()) {
      const { error: companyErr } = await supabase.from('profiles').update({ company_name: companyName.value.trim() }).eq('id', authStore.user.id)
        if (companyErr) throw companyErr
      // G9-5 : le nom saisi est aussi le nom de l'organisation (visible sur /join, Team, factures)
      const orgId = authStore.profile?.organization_id
      if (orgId && isOwner) {
        const { error: orgErr } = await supabase.from('organizations').update({ name: companyName.value.trim() }).eq('id', orgId)
        if (orgErr) console.error('Onboarding org name error:', orgErr)
      }
    } else if (step.value === 2 && clientName.value.trim()) {
      const result = await clientStore.addClient({ name: clientName.value.trim(), health: clientHealth.value })
      if (result && result.id) createdClientId.value = result.id
    } else if (step.value === 3 && taskTitle.value.trim()) {
      await taskStore.addTask({ title: taskTitle.value.trim(), client_id: createdClientId.value || null, status: 'todo', priority: 'medium' })
    }
    step.value++
  } catch (err) {
    errorMsg.value = t('onb_error')
    console.error('Onboarding step error:', err)
  } finally {
    saving.value = false
  }
}

function skipStep() { step.value++ }

async function sendCoachMessage() {
  if (!coachMessage.value.trim() || coachLoading.value) return
  coachLoading.value = true
  errorMsg.value = ''
  try {
    const response = await askScalyoAI({ module: 'coach', message: coachMessage.value.trim(), context: {} })
    // G9-2 : le backend renvoie { response } (cf. coach.module.js) — alignement sur CoachView
    coachResponse.value = (response && (response.response || response.content || response.message)) || ''
  } catch (err) {
    errorMsg.value = t('onb_error')
    console.error('Coach error:', err)
  } finally {
    coachLoading.value = false
  }
}

async function finishOnboarding() {
  saving.value = true
  errorMsg.value = ''
  try {
    const { error: onbErr } = await supabase.from('profiles').update({ onboarding_completed: true }).eq('id', authStore.user.id)
      if (onbErr) throw onbErr
    // G9-3 : fetchProfile exige l'uid (seul appelant qui ne le passait pas → profil stale → boucle onboarding)
    await authStore.fetchProfile(authStore.user.id)
    router.push({ name: 'dashboard' })
  } catch (err) {
    errorMsg.value = t('onb_error')
    console.error('Finish onboarding error:', err)
  } finally {
    saving.value = false
  }
}
</script>

<style scoped>
.onboarding-container { max-width: 560px; margin: 0 auto; padding: 48px 24px; min-height: 100vh; display: flex; flex-direction: column; }
.onboarding-progress { height: 4px; background: var(--border-color, #e5e7eb); border-radius: 2px; overflow: hidden; margin-bottom: 40px; }
.progress-bar { height: 100%; background: var(--primary, #6366f1); transition: width 0.4s cubic-bezier(0.4, 0, 0.2, 1); }
.step-indicator { font-size: 13px; color: var(--text-secondary, #6b7280); margin-bottom: 8px; }
.onboarding-step { flex: 1; }
.onboarding-step h1 { font-size: 28px; font-weight: 700; margin: 0 0 12px; color: var(--text-primary, #111827); letter-spacing: -0.02em; }
.step-desc { font-size: 16px; color: var(--text-secondary, #6b7280); margin: 0 0 32px; line-height: 1.5; }
.onb-input { width: 100%; padding: 14px 16px; font-size: 16px; border: 1px solid var(--border-color, #d1d5db); border-radius: 12px; outline: none; transition: border-color 0.2s; background: var(--bg-secondary, #fff); color: var(--text-primary, #111827); box-sizing: border-box; }
.onb-input:focus { border-color: var(--primary, #6366f1); }
.health-selector { margin-top: 24px; }
.health-selector label { display: block; font-size: 14px; font-weight: 500; margin-bottom: 12px; color: var(--text-primary, #111827); }
.health-dots { display: flex; gap: 8px; }
.dot { width: 36px; height: 36px; border-radius: 50%; border: 1px solid var(--border-color, #d1d5db); background: var(--bg-secondary, #fff); cursor: pointer; font-size: 13px; font-weight: 500; color: var(--text-secondary, #6b7280); transition: all 0.15s; display: flex; align-items: center; justify-content: center; }
.dot.active { background: var(--primary, #6366f1); border-color: var(--primary, #6366f1); color: #fff; }
.skip-hint { margin-top: 16px; font-size: 13px; color: var(--text-tertiary, #9ca3af); }
.coach-demo { display: flex; gap: 12px; align-items: stretch; }
.coach-demo .onb-input { flex: 1; }
.btn-send { padding: 0 20px; background: var(--primary, #6366f1); color: #fff; border: none; border-radius: 12px; font-size: 14px; font-weight: 600; cursor: pointer; white-space: nowrap; }
.btn-send:disabled { opacity: 0.5; cursor: not-allowed; }
.coach-response { margin-top: 16px; padding: 16px; background: var(--bg-tertiary, #f9fafb); border-radius: 12px; font-size: 14px; line-height: 1.6; color: var(--text-primary, #111827); max-height: 200px; overflow-y: auto; }
.onboarding-done { text-align: center; padding-top: 60px; }
.done-icon { width: 64px; height: 64px; margin: 0 auto 24px; background: var(--success, #10b981); color: #fff; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 32px; font-weight: 700; }
.onb-error { color: var(--error, #ef4444); font-size: 14px; margin-top: 12px; }
.onboarding-nav { display: flex; gap: 12px; justify-content: flex-end; margin-top: 40px; padding-bottom: 24px; }
.btn-back, .btn-skip { padding: 12px 24px; font-size: 14px; font-weight: 500; border: 1px solid var(--border-color, #d1d5db); border-radius: 12px; background: transparent; color: var(--text-secondary, #6b7280); cursor: pointer; }
.btn-next { padding: 12px 32px; font-size: 14px; font-weight: 600; background: var(--primary, #6366f1); color: #fff; border: none; border-radius: 12px; cursor: pointer; transition: opacity 0.15s; }
.btn-next:disabled { opacity: 0.5; cursor: not-allowed; }
.btn-finish { background: var(--success, #10b981); }
@media (max-width: 640px) {
  .onboarding-container { padding: 24px 16px; }
  .onboarding-step h1 { font-size: 24px; }
  .health-dots { flex-wrap: wrap; }
  .dot { width: 32px; height: 32px; font-size: 12px; }
}
</style>
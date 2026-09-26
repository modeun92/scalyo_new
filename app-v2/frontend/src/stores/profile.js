import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { supabase } from '@/lib/supabase'
import { withWrite } from '@/lib/supabaseWrite'
import { DEFAULT_CURRENCY, isSupportedCurrency } from '@/config/currencies'

// CORE-V2-STAGE1 (24/09/2026): the profile is the caller's WORKER row in core_v2, read and written
// through three RPCs (supabase/migrations/20260924100000_core_v2_stage1_user_profiles.sql) — no
// longer the old user_profiles table, which is being retired. Shape of `profile`:
//   { organization_id, currency, role, seniority, onboarding_completed, is_manager }
// or null when the caller works in no organization yet (no questionnaire, default currency).
export const useProfileStore = defineStore('profile', () => {
  const profile = ref(null)
  const loading = ref(false)

  const isComplete = computed(() => profile.value?.onboarding_completed === true)
  const isManager = computed(() => profile.value?.is_manager === true)

  const ROLE_OPTIONS = [
    { value: 'csm', labelKey: 'profile_role_csm' },
    { value: 'kam', labelKey: 'profile_role_kam' },
    { value: 'sales', labelKey: 'profile_role_sales' },
    { value: 'pm', labelKey: 'profile_role_pm' },
    { value: 'head_cs', labelKey: 'profile_role_head_cs' },
    { value: 'cro', labelKey: 'profile_role_cro' },
    { value: 'founder', labelKey: 'profile_role_founder' },
    { value: 'other', labelKey: 'profile_role_other' },
  ]

  const SENIORITY_OPTIONS = [
    { value: 'junior', labelKey: 'profile_sen_junior' },
    { value: 'mid', labelKey: 'profile_sen_mid' },
    { value: 'senior', labelKey: 'profile_sen_senior' },
    { value: 'lead', labelKey: 'profile_sen_lead' },
    { value: 'director', labelKey: 'profile_sen_director' },
    { value: 'vp', labelKey: 'profile_sen_vp' },
    { value: 'c_level', labelKey: 'profile_sen_clevel' },
  ]

  async function load() {
    loading.value = true
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return
      const { data, error } = await supabase.rpc('core_v2_my_profile')
      if (error) { console.error('Profile load error:', error.message || error); return }
      profile.value = data || null
    } catch (e) {
      console.error('Profile load error:', e)
    } finally {
      loading.value = false
    }
  }

  // CURRENCY-ORG (24/09/2026): the currency belongs to the ORGANIZATION (core_v2
  // company.currency_code) and to each profit amount — never to a person, so every teammate sees
  // the same amounts labelled the same way. It is what every amount in the product is LABELLED in
  // (zero conversion, A-11). Deliberately NOT restricted to SUPPORTED_CURRENCIES: it must report
  // what lib/formatters.accountCurrency() actually renders, which also accepts a stored code Intl
  // knows but the picker does not list yet. Narrowing it here would make the settings screen claim
  // EUR while every amount on the page said otherwise.
  const currency = computed(() => {
    const c = String(profile.value?.currency || '').trim().toUpperCase()
    return /^[A-Z]{3}$/.test(c) ? c : DEFAULT_CURRENCY
  })

  // D-14 / D-15: through withWrite, and returns { success } / { error } — the picker only shows
  // a ✓ after a confirmed write and reverts its selection otherwise (same contract as
  // auth.saveLocale). Managers only (decided 24/09/2026); the RPC refuses anyone else, this check
  // only spares a round trip the server would reject.
  async function setCurrency(code) {
    const next = String(code || '').trim().toUpperCase()
    if (!isSupportedCurrency(next)) return { error: 'unsupported_currency' }
    if (!isManager.value) return { error: 'not_a_manager' }
    if (currency.value === next) return { success: true }
    const { error } = await withWrite(
      () => supabase.rpc('core_v2_set_organization_currency', { p_code: next }),
      { label: 'profile.setCurrency' }
    )
    if (error) { console.error('setCurrency — write failed:', error.message || error); return { error: error.message || String(error) } }
    // New object identity: fmtCurrency() is called inside render computeds, they must re-run.
    profile.value = { ...profile.value, currency: next }
    return { success: true }
  }

  // The questionnaire: role, seniority and both consents in ONE call, so a half-saved answer (flag
  // set, consent missing) cannot happen. D-14: the wizard closes only on { success }.
  async function completeOnboarding({ role, seniority, aiConsent, analyticsConsent }) {
    const { error } = await withWrite(
      () => supabase.rpc('core_v2_complete_onboarding', {
        p_role: role,
        p_seniority: seniority,
        p_ai_consent: aiConsent === true,
        p_analytics_consent: analyticsConsent === true,
      }),
      { label: 'profile.completeOnboarding' }
    )
    if (error) { console.error('completeOnboarding — write failed:', error.message || error); return { error: error.message || String(error) } }
    profile.value = { ...profile.value, role, seniority, onboarding_completed: true }
    return { success: true }
  }

  // Industry, company size, portfolio size, goals and the rest were dropped with user_profiles
  // (decided 20/09/2026): role and seniority are what the AI still gets to know about the person.
  function toAIContext() {
    if (!profile.value) return ''
    const p = profile.value
    const parts = []
    if (p.role) parts.push('Role: ' + p.role)
    if (p.seniority) parts.push('Seniority: ' + p.seniority)
    return parts.join(' | ')
  }

  return {
    profile, loading, isComplete, isManager, currency,
    ROLE_OPTIONS, SENIORITY_OPTIONS,
    load, setCurrency, completeOnboarding, toAIContext,
  }
})

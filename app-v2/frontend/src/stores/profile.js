import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { supabase } from '@/lib/supabase'

export const useProfileStore = defineStore('profile', () => {
  const profile = ref(null)
  const loading = ref(false)

  const isComplete = computed(() => profile.value?.onboarding_completed === true)

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

  const INDUSTRY_OPTIONS = [
    { value: 'saas', labelKey: 'profile_ind_saas' },
    { value: 'fintech', labelKey: 'profile_ind_fintech' },
    { value: 'healthtech', labelKey: 'profile_ind_healthtech' },
    { value: 'edtech', labelKey: 'profile_ind_edtech' },
    { value: 'ecommerce', labelKey: 'profile_ind_ecommerce' },
    { value: 'marketplace', labelKey: 'profile_ind_marketplace' },
    { value: 'agency', labelKey: 'profile_ind_agency' },
    { value: 'consulting', labelKey: 'profile_ind_consulting' },
    { value: 'other', labelKey: 'profile_ind_other' },
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

  const SIZE_OPTIONS = [
    { value: 'solo', labelKey: 'profile_size_solo' },
    { value: 'smb', labelKey: 'profile_size_smb' },
    { value: 'mid_market', labelKey: 'profile_size_mid' },
    { value: 'enterprise', labelKey: 'profile_size_enterprise' },
  ]

  async function load() {
    loading.value = true
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return
      const { data, error } = await supabase
        .from('user_profiles')
        .select('*')
        .eq('id', session.user.id)
        .single()
      if (!error && data) profile.value = data
    } catch (e) {
      console.error('Profile load error:', e)
    }
    loading.value = false
  }

  async function save(updates) {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return
    const { data, error } = await supabase
      .from('user_profiles')
      .upsert({ id: session.user.id, ...updates }, { onConflict: 'id' })
      .select()
      .single()
    if (!error && data) profile.value = data
    return { data, error }
  }

  function toAIContext() {
    if (!profile.value) return ''
    const p = profile.value
    const parts = []
    if (p.role) parts.push('Role: ' + (p.role_custom || p.role))
    if (p.seniority) parts.push('Seniority: ' + p.seniority)
    if (p.industry) parts.push('Industry: ' + (p.industry_custom || p.industry))
    if (p.company_size) parts.push('Company size: ' + p.company_size)
    if (p.market) parts.push('Market: ' + p.market)
    if (p.portfolio_size) parts.push('Portfolio: ' + p.portfolio_size + ' accounts')
    if (p.avg_contract_value) parts.push('Avg contract: ' + p.avg_contract_value + ' ' + (p.currency || 'EUR'))
    if (p.goals?.length) parts.push('Goals: ' + p.goals.join(', '))
    if (p.challenges?.length) parts.push('Challenges: ' + p.challenges.join(', '))
    if (p.tools?.length) parts.push('Tools: ' + p.tools.join(', '))
    if (p.processes && Object.keys(p.processes).length) parts.push('Processes: ' + JSON.stringify(p.processes))
    return parts.join(' | ')
  }

  return {
    profile, loading, isComplete,
    ROLE_OPTIONS, INDUSTRY_OPTIONS, SENIORITY_OPTIONS, SIZE_OPTIONS,
    load, save, toAIContext,
  }
})

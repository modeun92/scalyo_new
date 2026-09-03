// BILLING-SEAT (27/08/2026): the SINGLE SOURCE for subscription amounts = GET /api/billing.
// The server decides the role (D1), the source (real Stripe data or table × seats) and the currency;
// this store computes nothing and carries no price. Consumed by SettingsBilling and ProfileView.
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { supabase } from '@/lib/supabase'

const FRESH_MS = 60_000

export const useBillingStore = defineStore('billing', () => {
  const data = ref(null)
  const loading = ref(false)
  const error = ref(null)
  const loadedAt = ref(0)

  const canViewAmounts = computed(() => data.value?.can_view_amounts === true)
  const currency = computed(() => data.value?.currency || null)

  async function load({ force = false } = {}) {
    if (loading.value) return
    if (!force && data.value && Date.now() - loadedAt.value < FRESH_MS) return
    loading.value = true
    error.value = null
    try {
      const token = (await supabase.auth.getSession()).data.session?.access_token
      if (!token) { error.value = 'no_session'; return }
      const resp = await fetch('/api/billing', { headers: { Authorization: 'Bearer ' + token } })
      if (!resp.ok) { error.value = 'http_' + resp.status; data.value = null; return }
      data.value = await resp.json()
      loadedAt.value = Date.now()
      // Stripe and the org disagree on the plan: Stripe is authoritative on screen, we trace it (contract §5).
      if (data.value.plan_mismatch && window.Sentry) {
        window.Sentry.captureMessage('billing: plan Stripe != plan org', { level: 'warning', extra: { stripe: data.value.plan, org: data.value.org_plan } })
      }
    } catch (err) {
      error.value = 'network'
      data.value = null
      if (window.Sentry) window.Sentry.captureException(err)
    } finally {
      loading.value = false
    }
  }

  function reset() { data.value = null; error.value = null; loadedAt.value = 0 }

  return { data, loading, error, canViewAmounts, currency, load, reset }
})

import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { supabase } from '@/lib/supabase'
import { INTEGRATIONS, getIntegrationsByCategory, getAvailableForPlan } from '@/config/integrations'

export const useIntegrationStore = defineStore('integrations', () => {
  const connections = ref([])
  const loading = ref(false)
  const lastError = ref(null)

  const connectedIds = computed(() => connections.value.filter(c => c.status === 'active').map(c => c.integration_id))

  function isConnected(integrationId) {
    return connectedIds.value.includes(integrationId)
  }

  function getConnection(integrationId) {
    return connections.value.find(c => c.integration_id === integrationId) || null
  }

  // CR-8 (E-09): safe columns only — access_token/refresh_token/config
  // never travel back down to the client (column REVOKE in the database, migration CR-8)
  async function loadConnections() {
    loading.value = true
    lastError.value = null
    try {
      const { data, error } = await supabase
        .from('org_integrations')
        .select('id, integration_id, status, connected_at, updated_at')
        .order('connected_at', { ascending: false })
      if (error) throw error
      connections.value = data || []
    } catch (err) {
      lastError.value = err.message
      connections.value = []
    } finally {
      loading.value = false
    }
  }

  // CR-8 (E-09): write through the back end, which encrypts the secret fields
  async function pushConfig(integrationId, config) {
    const token = (await supabase.auth.getSession()).data.session?.access_token
    const r = await fetch('/api/integrations/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
      body: JSON.stringify({ provider: integrationId, fields: config }),
    })
    if (!r.ok) {
      const data = await r.json().catch(() => ({}))
      throw new Error(data.error || 'save_failed')
    }
    return r.json()
  }

  async function saveConfig(integrationId, config) {
    lastError.value = null
    try {
      const existing = getConnection(integrationId)
      if (!existing) throw new Error('not_connected')
      await pushConfig(integrationId, config)
    } catch (err) { lastError.value = err.message; throw err }
  }

  async function disconnect(integrationId) {
    lastError.value = null
    try {
      const existing = getConnection(integrationId)
      if (!existing) return
      const { error } = await supabase.from('org_integrations').delete().eq('id', existing.id)
      if (error) throw error
      connections.value = connections.value.filter(c => c.id !== existing.id)
    } catch (err) { lastError.value = err.message; throw err }
  }

  async function connectWebhook(integrationId, config) {
    lastError.value = null
    try {
      const data = await pushConfig(integrationId, config)
      connections.value.unshift(data)
      return data
    } catch (err) { lastError.value = err.message; throw err }
  }

  // INTEGRATIONS-I18N (04/09): the catalog carries i18n keys; the view renders them (no t() in a store).
  function getCatalog() { return getIntegrationsByCategory() }
  function getAvailable(plan) { return getAvailableForPlan(plan) }
  function getIntegrationMeta(id) { return INTEGRATIONS[id] || null }

  return { connections, loading, lastError, connectedIds, isConnected, getConnection, loadConnections, saveConfig, disconnect, connectWebhook, getCatalog, getAvailable, getIntegrationMeta }
})

// === SCALYO — Back-end plans (quotas + limits) ===
// CR-2: the MODULES come from the single source plans.config.js (enterprise included).
// This file now only carries the AI quotas and the seat/client limits.
// Prices removed (D2: billing = Stripe, display = i18n).
import { PLANS as CONFIG } from './plans.config.js'

const QUOTAS = {
  starter: { coach: 35, nova: 35, wellbeing: 35, dashboard: 35, copil: 35, matrix: 35 },
  growth: { coach: 100, nova: 100, wellbeing: 100, dashboard: 100, copil: 100, matrix: 100, import: 100, playbook: 100 },
  elite: { coach: 200, nova: 200, wellbeing: 200, dashboard: 200, copil: 200, matrix: 200, import: 200, playbook: 200, email: 200, notif: 200 },
  enterprise: { coach: -1, nova: -1, wellbeing: -1, dashboard: -1, copil: -1, matrix: -1, import: -1, playbook: -1, email: -1, notif: -1 },
}

const LIMITS = {
  starter: { maxUsers: 3, maxClients: 50 },
  growth: { maxUsers: 7, maxClients: -1 },
  elite: { maxUsers: 24, maxClients: -1 },
  enterprise: { maxUsers: -1, maxClients: -1 },
}

function planKey(planId) { return CONFIG[planId] ? planId : 'starter' }

export function getPlan(planId) {
  const key = planKey(planId)
  return { name: key, modules: CONFIG[key].modules, quotas: QUOTAS[key], maxUsers: LIMITS[key].maxUsers, maxClients: LIMITS[key].maxClients }
}

export function isModuleAllowed(planId, moduleName) {
  return getPlan(planId).modules.includes(moduleName)
}

export function getQuota(planId, moduleName) {
  const q = getPlan(planId).quotas?.[moduleName]
  return q === -1 ? Infinity : (q || 0)
}

export function getMaxUsers(planId) {
  const m = getPlan(planId).maxUsers
  return m === -1 ? Infinity : (m || 3)
}

export function getMaxClients(planId) {
  const max = getPlan(planId).maxClients
  return max === -1 ? Infinity : max
}

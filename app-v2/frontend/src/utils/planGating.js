// === SCALYO — Plan Gating (front end) ===
// CR-2: single source = plans.config.js (PLANS[plan].modules, enterprise included).
// Zero duplicated list. Starter fallback (the most restrictive, never elevating).
import { PLANS } from '@/config/plans.config.js'

function modulesFor(planId) {
  return (PLANS[planId] && PLANS[planId].modules) || PLANS.starter.modules
}

export function isModuleAllowed(planId, moduleName) {
  return modulesFor(planId).includes(moduleName)
}

export function getAllowedModules(planId) {
  return modulesFor(planId)
}

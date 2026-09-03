// === SCALYO — Plan Gating (frontend) ===
// CR-2 : source unique = plans.config.js (PLANS[plan].modules, enterprise inclus).
// Zéro liste dupliquée. Fallback starter (le plus restrictif, jamais élévateur).
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

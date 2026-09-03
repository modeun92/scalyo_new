// Localized rendering of persisted notifications (chantier 3 / A-06).
// Notifications are stored as `type` + `payload` (a snapshot of the values at
// alert time). Their title/body are rendered HERE at the reader's current locale,
// so a KO/EN reader never sees French. Legacy rows without a payload fall back to
// the stored (French) title/body so nothing breaks during migration.
//
// `t` is the vue-i18n translate function passed in by the calling component
// (keeps this a pure helper with no useI18n() call outside a setup scope).

import { fmtDate, fmtHealth } from '@/lib/formatters'

function hasPayload(n) {
  return !!(n && n.payload && typeof n.payload === 'object' && Object.keys(n.payload).length > 0)
}

export function notifTitle(n, t) {
  if (!hasPayload(n)) return (n && n.title) || ''
  const p = n.payload
  switch (n.type) {
    case 'churn_risk':   return t('notif_churn_risk_title', { name: p.name })
    case 'renewal':      return t('notif_renewal_title', { name: p.name, days: p.days })
    case 'nps_drop':     return t('notif_nps_drop_title', { name: p.name })
    case 'task_overdue': return t('notif_task_overdue_title', { title: p.title })
    case 'burnout':      return t('notif_burnout_title', { name: p.name })
    case 'client_activity': return t('notif_client_activity_title', { author: p.author_name, name: p.client_name })
    default:             return n.title || ''
  }
}

export function notifBody(n, t) {
  if (!hasPayload(n)) return (n && n.body) || ''
  const p = n.payload
  switch (n.type) {
    // DATE-RAW / HEALTH-SCALE : la date et le score sont formatés à la locale du LECTEUR (le payload reste brut)
    case 'churn_risk':   return t('notif_churn_risk_body', { health: fmtHealth(p.health, { suffix: false }) })
    case 'renewal':      return t('notif_renewal_body', { date: fmtDate(p.date) })
    case 'nps_drop':     return t('notif_nps_drop_body', { nps: p.nps })
    case 'task_overdue': return t('notif_task_overdue_body', { days: p.days, status: t('status_' + p.status) })
    case 'burnout': {
      const reasons = []
      if (p.wellbeing != null) reasons.push(t('notif_burnout_reason_wellbeing', { v: p.wellbeing }))
      if (p.workload != null) reasons.push(t('notif_burnout_reason_workload', { v: p.workload }))
      return t('notif_burnout_body', { reasons: reasons.join(', ') })
    }
    case 'client_activity': return t('notif_client_activity_body', { kind: t('cd_kind_' + (p.kind || 'note')) })
    default: return n.body || ''
  }
}

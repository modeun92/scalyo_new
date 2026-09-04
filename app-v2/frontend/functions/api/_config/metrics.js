import { t } from '../_i18n/translate.js'

// Single source of truth for metric definitions.
// Used by AI prompts (dashboard, coach) to explain metrics to users.
// Adding a metric = add an entry here. The AI prompt builds itself from this config.

export const METRICS = {
  arr: {
    labelKey: 'metric_arr_label',
    descriptionKey: 'metric_arr_description',
    type: 'realtime'
  },
  health_score: {
    labelKey: 'metric_health_score_label',
    descriptionKey: 'metric_health_score_description',
    type: 'realtime'
  },
  churn_rate: {
    labelKey: 'metric_churn_rate_label',
    descriptionKey: 'metric_churn_rate_description',
    type: 'period',
    requires: 'churned_at column on clients table'
  },
  nps: {
    labelKey: 'metric_nps_label',
    descriptionKey: 'metric_nps_description',
    type: 'realtime'
  },
  nrr: {
    labelKey: 'metric_nrr_label',
    descriptionKey: 'metric_nrr_description',
    type: 'period',
    requires: 'historical snapshots (accumulate daily)'
  },
  active_users: {
    labelKey: 'metric_active_users_label',
    descriptionKey: 'metric_active_users_description',
    type: 'realtime'
  },
  churn_risk: {
    labelKey: 'metric_churn_risk_label',
    descriptionKey: 'metric_churn_risk_description',
    type: 'predictive'
  }
}

// Build a localized metric explanation block for AI prompts
// METRICS-I18N (04/09): labels and descriptions were inline { fr, en, ko } tables in this file -
// a translation table outside _i18n/, duplicating labels the front end also carried. They are keys
// now (metric_<id>_label / metric_<id>_desc) resolved by the server i18n module like every other
// server string. Behaviour change worth knowing: an unknown lang used to yield 'undefined :
// undefined' (m.label[lang] on a missing key); t() falls back to English instead.
export function getMetricsContext(lang = 'fr') {
  return Object.values(METRICS)
    .map(m => t(m.labelKey, lang) + ' : ' + t(m.descriptionKey, lang))
    .join('\n- ')
}

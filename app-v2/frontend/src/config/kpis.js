// KPI-I18N (04/09): the KPI library — 53 selectable KPIs in 11 categories. Was
// `src/data/kpiCatalog.js`, which carried its own THREE-column translation table
// (`label` / `labelEN` / `labelKO`) and made five components re-implement the same
// `locale === 'en' ? labelEN : locale === 'ko' ? labelKO : label` ladder. A label is
// product content in the user's language, so it belongs in i18n like every other string:
// each entry now carries an i18n KEY (`kpilib_<id>`, `kpilibcat_<id>`) and the views render
// it with t(). check-i18n.mjs now covers these labels — the old table was invisible to it,
// which is how a Korean label could go missing without any check failing.
//
// What stays here is the part i18n CANNOT hold, because it is not language-dependent:
//   source   'auto' = derived by the app  |  'manual' = entered monthly on a client record
//   agg      how monthly manual values aggregate org-wide ('avg' / 'sum') — stores/clientMetrics
//   cat      category id, joins KPI_CATEGORIES
//   unit     display suffix ('%', 'h', '/10'…). NEVER read it directly: formatters.kpiUnit()
//   format   which formatter renders the value (lib/formatters.fmtKpiValue)
//   roles / sectors    who the KPI is offered to in KpiCustomizer
//   benchmark / recommended / inverse    thresholds, default picks, "lower is better"
//
// CURRENCY-ACCOUNT (04/09): a monetary KPI carries NO fixed unit — `unit: null` + `format:
// 'currency'`. Its symbol is the ACCOUNT's, resolved at render time by formatters.kpiUnit().
// Before this, these entries held a literal '€' that was printed next to a value fmtCurrency
// had already rendered in the account currency: "$1,200 €" on a USD account (error_list §5).
export const KPI_CATALOG = [
  // ── REVENUE ──
  { id: 'arr', label: 'kpilib_arr', source: 'auto', cat: 'revenue', unit: null, format: 'currency', roles: ['csm','kam','commercial','manager'], sectors: ['b2b','saas'] },
  { id: 'mrr', label: 'kpilib_mrr', source: 'auto', cat: 'revenue', unit: null, format: 'currency', roles: ['csm','kam','commercial','manager'], sectors: ['b2b','saas'] },
  { id: 'revenue_total', label: 'kpilib_revenue_total', source: 'auto', cat: 'revenue', unit: null, format: 'currency', roles: ['manager','commercial'], sectors: ['b2b','b2c','retail'] },
  { id: 'revenue_growth', label: 'kpilib_revenue_growth', source: 'manual', agg: 'avg', cat: 'revenue', unit: '%', format: 'percentage', roles: ['manager','commercial'], sectors: ['b2b','b2c'] },
  { id: 'acv', label: 'kpilib_acv', source: 'manual', agg: 'avg', cat: 'revenue', unit: null, format: 'currency', roles: ['commercial','kam'], sectors: ['b2b','saas'] },
  { id: 'ltv', label: 'kpilib_ltv', source: 'manual', agg: 'avg', cat: 'revenue', unit: null, format: 'currency', roles: ['csm','kam','manager'], sectors: ['b2b','b2c','saas'] },
  { id: 'ltv_cac', label: 'kpilib_ltv_cac', source: 'manual', agg: 'avg', cat: 'revenue', unit: 'x', format: 'ratio', roles: ['manager'], sectors: ['b2b','b2c','saas'] },
  { id: 'arpu', label: 'kpilib_arpu', source: 'manual', agg: 'avg', cat: 'revenue', unit: null, format: 'currency', roles: ['manager','commercial'], sectors: ['b2c','saas','marketplace'] },
  { id: 'gmv', label: 'kpilib_gmv', source: 'manual', agg: 'sum', cat: 'revenue', unit: null, format: 'currency', roles: ['manager','commercial'], sectors: ['marketplace','ecommerce'] },

  // ── RETENTION ──
  { id: 'nrr', label: 'kpilib_nrr', source: 'auto', cat: 'retention', unit: '%', format: 'percentage', roles: ['csm','kam','manager'], sectors: ['b2b','saas'], benchmark: { good: 100, excellent: 110, world_class: 130 }, recommended: true },
  { id: 'grr', label: 'kpilib_grr', source: 'manual', agg: 'avg', cat: 'retention', unit: '%', format: 'percentage', roles: ['csm','manager'], sectors: ['b2b','saas'] },
  { id: 'churn_rate', label: 'kpilib_churn_rate', source: 'auto', cat: 'retention', unit: '%', format: 'percentage', roles: ['csm','kam','manager'], sectors: ['b2b','b2c','saas'], benchmark: { good: 3, excellent: 1, alert: 7 }, recommended: true, inverse: true },
  { id: 'churn_revenue', label: 'kpilib_churn_revenue', source: 'manual', agg: 'sum', cat: 'retention', unit: null, format: 'currency', roles: ['csm','manager'], sectors: ['b2b','saas'], inverse: true },
  { id: 'renewal_rate', label: 'kpilib_renewal_rate', source: 'manual', agg: 'avg', cat: 'retention', unit: '%', format: 'percentage', roles: ['csm','kam'], sectors: ['b2b','saas'] },
  { id: 'logo_retention', label: 'kpilib_logo_retention', source: 'manual', agg: 'avg', cat: 'retention', unit: '%', format: 'percentage', roles: ['csm','manager'], sectors: ['b2b','saas'] },
  { id: 'time_to_churn', label: 'kpilib_time_to_churn', source: 'manual', agg: 'avg', cat: 'retention', unit: 'j', format: 'days', roles: ['csm','manager'], sectors: ['b2b','saas'], inverse: true },

  // ── SATISFACTION ──
  { id: 'nps', label: 'kpilib_nps', source: 'auto', cat: 'satisfaction', unit: '', format: 'score', roles: ['csm','kam','manager'], sectors: ['b2b','b2c'], benchmark: { good: 30, excellent: 50, world_class: 70 }, recommended: true },
  { id: 'csat', label: 'kpilib_csat', source: 'manual', agg: 'avg', cat: 'satisfaction', unit: '%', format: 'percentage', roles: ['csm','support','manager'], sectors: ['b2b','b2c'] },
  { id: 'ces', label: 'kpilib_ces', source: 'manual', agg: 'avg', cat: 'satisfaction', unit: '/7', format: 'score', roles: ['csm','support'], sectors: ['b2b','b2c'] },
  { id: 'health_score', label: 'kpilib_health_score', source: 'auto', cat: 'satisfaction', unit: '/10', format: 'score', roles: ['csm','kam','manager'], sectors: ['b2b','saas'], recommended: true },
  { id: 'promoters_pct', label: 'kpilib_promoters_pct', source: 'manual', agg: 'avg', cat: 'satisfaction', unit: '%', format: 'percentage', roles: ['csm','manager'], sectors: ['b2b','b2c'] },

  // ── ACQUISITION ──
  { id: 'new_clients', label: 'kpilib_new_clients', source: 'auto', cat: 'acquisition', unit: '', format: 'number', roles: ['commercial','manager'], sectors: ['b2b','b2c'] },
  { id: 'cac', label: 'kpilib_cac', source: 'manual', agg: 'avg', cat: 'acquisition', unit: null, format: 'currency', roles: ['commercial','manager'], sectors: ['b2b','b2c'], inverse: true },
  { id: 'conversion_rate', label: 'kpilib_conversion_rate', source: 'manual', agg: 'avg', cat: 'acquisition', unit: '%', format: 'percentage', roles: ['commercial','manager'], sectors: ['b2b','b2c'] },
  { id: 'win_rate', label: 'kpilib_win_rate', source: 'auto', cat: 'acquisition', unit: '%', format: 'percentage', roles: ['commercial','kam'], sectors: ['b2b'] },
  { id: 'pipeline_value', label: 'kpilib_pipeline_value', source: 'auto', cat: 'acquisition', unit: null, format: 'currency', roles: ['commercial','manager'], sectors: ['b2b'] },
  { id: 'sales_cycle', label: 'kpilib_sales_cycle', source: 'manual', agg: 'avg', cat: 'acquisition', unit: 'j', format: 'days', roles: ['commercial','manager'], sectors: ['b2b'], inverse: true },

  // ── EXPANSION ──
  { id: 'expansion_rate', label: 'kpilib_expansion_rate', source: 'manual', agg: 'avg', cat: 'expansion', unit: '%', format: 'percentage', roles: ['csm','kam','manager'], sectors: ['b2b','saas'] },
  { id: 'arr_expansion', label: 'kpilib_arr_expansion', source: 'manual', agg: 'sum', cat: 'expansion', unit: null, format: 'currency', roles: ['csm','kam'], sectors: ['b2b','saas'] },
  { id: 'upsell_rate', label: 'kpilib_upsell_rate', source: 'manual', agg: 'avg', cat: 'expansion', unit: '%', format: 'percentage', roles: ['csm','kam','commercial'], sectors: ['b2b','saas'] },
  { id: 'cross_sell_rate', label: 'kpilib_cross_sell_rate', source: 'manual', agg: 'avg', cat: 'expansion', unit: '%', format: 'percentage', roles: ['csm','kam','commercial'], sectors: ['b2b'] },

  // ── ACTIVATION ──
  { id: 'time_to_value', label: 'kpilib_time_to_value', source: 'manual', agg: 'avg', cat: 'activation', unit: 'j', format: 'days', roles: ['csm'], sectors: ['b2b','saas'], inverse: true },
  { id: 'activation_rate', label: 'kpilib_activation_rate', source: 'manual', agg: 'avg', cat: 'activation', unit: '%', format: 'percentage', roles: ['csm','manager'], sectors: ['b2b','saas'] },
  { id: 'feature_adoption', label: 'kpilib_feature_adoption', source: 'manual', agg: 'avg', cat: 'activation', unit: '%', format: 'percentage', roles: ['csm'], sectors: ['saas'] },
  { id: 'dau_mau', label: 'kpilib_dau_mau', source: 'manual', agg: 'avg', cat: 'activation', unit: '%', format: 'percentage', roles: ['csm','manager'], sectors: ['saas','b2c'] },
  { id: 'active_users', label: 'kpilib_active_users', source: 'auto', cat: 'activation', unit: '', format: 'number', roles: ['csm','manager'], sectors: ['saas','b2c'] },

  // ── CS TEAM ──
  { id: 'accounts_per_csm', label: 'kpilib_accounts_per_csm', source: 'auto', cat: 'team', unit: '', format: 'number', roles: ['manager'], sectors: ['b2b','saas'] },
  { id: 'arr_per_csm', label: 'kpilib_arr_per_csm', source: 'auto', cat: 'team', unit: null, format: 'currency', roles: ['manager'], sectors: ['b2b','saas'] },
  { id: 'team_wellbeing', label: 'kpilib_team_wellbeing', source: 'manual', agg: 'avg', cat: 'team', unit: '/10', format: 'score', roles: ['manager'], sectors: ['b2b','b2c'] },
  { id: 'qbr_completion', label: 'kpilib_qbr_completion', source: 'manual', agg: 'avg', cat: 'team', unit: '%', format: 'percentage', roles: ['csm','manager'], sectors: ['b2b','saas'] },
  { id: 'response_time', label: 'kpilib_response_time', source: 'manual', agg: 'avg', cat: 'team', unit: 'h', format: 'hours', roles: ['csm','support'], sectors: ['b2b','b2c'], inverse: true },

  // ── SUPPORT ──
  { id: 'tickets_open', label: 'kpilib_tickets_open', source: 'manual', agg: 'sum', cat: 'support', unit: '', format: 'number', roles: ['support','csm','manager'], sectors: ['b2b','b2c'], inverse: true },
  { id: 'resolution_time', label: 'kpilib_resolution_time', source: 'manual', agg: 'avg', cat: 'support', unit: 'h', format: 'hours', roles: ['support','manager'], sectors: ['b2b','b2c'], inverse: true },
  { id: 'fcr', label: 'kpilib_fcr', source: 'manual', agg: 'avg', cat: 'support', unit: '%', format: 'percentage', roles: ['support','manager'], sectors: ['b2b','b2c'] },

  // ── ENGAGEMENT ──
  { id: 'email_open_rate', label: 'kpilib_email_open_rate', source: 'manual', agg: 'avg', cat: 'engagement', unit: '%', format: 'percentage', roles: ['csm','commercial'], sectors: ['b2b','b2c'] },
  { id: 'meeting_show_rate', label: 'kpilib_meeting_show_rate', source: 'manual', agg: 'avg', cat: 'engagement', unit: '%', format: 'percentage', roles: ['csm','commercial'], sectors: ['b2b'] },
  { id: 'engagement_score', label: 'kpilib_engagement_score', source: 'manual', agg: 'avg', cat: 'engagement', unit: '/100', format: 'score', roles: ['csm','manager'], sectors: ['b2b','b2c'] },

  // ── E-COMMERCE ──
  { id: 'cart_abandonment', label: 'kpilib_cart_abandonment', source: 'manual', agg: 'avg', cat: 'ecommerce', unit: '%', format: 'percentage', roles: ['commercial','manager'], sectors: ['ecommerce','b2c'], inverse: true },
  { id: 'repeat_purchase', label: 'kpilib_repeat_purchase', source: 'manual', agg: 'avg', cat: 'ecommerce', unit: '%', format: 'percentage', roles: ['commercial','manager'], sectors: ['ecommerce','b2c','retail'] },
  { id: 'aov', label: 'kpilib_aov', source: 'manual', agg: 'avg', cat: 'ecommerce', unit: null, format: 'currency', roles: ['commercial','manager'], sectors: ['ecommerce','b2c','retail'] },

  // ── PROJECTS ──
  { id: 'projects_on_time', label: 'kpilib_projects_on_time', source: 'manual', agg: 'avg', cat: 'projects', unit: '%', format: 'percentage', roles: ['manager','csm'], sectors: ['b2b','b2c'] },
  { id: 'tasks_completion', label: 'kpilib_tasks_completion', source: 'auto', cat: 'projects', unit: '%', format: 'percentage', roles: ['manager','csm'], sectors: ['b2b','b2c'] },
  { id: 'estimation_accuracy', label: 'kpilib_estimation_accuracy', source: 'manual', agg: 'avg', cat: 'projects', unit: '%', format: 'percentage', roles: ['manager'], sectors: ['b2b'] },
]

// Categories: `icon` is an emoji, not a translatable string — it stays here.
export const KPI_CATEGORIES = [
  { id: 'revenue', icon: '📈', label: 'kpilibcat_revenue' },
  { id: 'retention', icon: '🎯', label: 'kpilibcat_retention' },
  { id: 'satisfaction', icon: '💚', label: 'kpilibcat_satisfaction' },
  { id: 'acquisition', icon: '🚀', label: 'kpilibcat_acquisition' },
  { id: 'expansion', icon: '📊', label: 'kpilibcat_expansion' },
  { id: 'activation', icon: '⚡', label: 'kpilibcat_activation' },
  { id: 'team', icon: '👥', label: 'kpilibcat_team' },
  { id: 'support', icon: '🎧', label: 'kpilibcat_support' },
  { id: 'engagement', icon: '📞', label: 'kpilibcat_engagement' },
  { id: 'ecommerce', icon: '🛒', label: 'kpilibcat_ecommerce' },
  { id: 'projects', icon: '📁', label: 'kpilibcat_projects' },
]

// KPI-I18N (04/09): the KPI library — 53 selectable KPIs in 11 categories. Was
// `src/data/kpiCatalog.js`, which carried its own THREE-column translation table
// (`label` / `labelEN` / `labelKO`) and made five components re-implement the same
// `locale === 'en' ? labelEN : locale === 'ko' ? labelKO : label` ladder. A label is
// product content in the user's language, so it belongs in i18n like every other string:
// each entry now carries an i18n KEY (`kpi_library_<id>`, `kpi_library_category_<id>`) and the views render
// it with t(). check-i18n.mjs now covers these labels — the old table was invisible to it,
// which is how a Korean label could go missing without any check failing.
//
// What stays here is the part i18n CANNOT hold, because it is not language-dependent:
//   source        'auto' = derived by the app  |  'manual' = entered monthly on a client record
//   aggregation   how monthly manual values aggregate org-wide ('avg' / 'sum') — stores/clientMetrics
//   category      category id, joins KPI_CATEGORIES
//   unit          display suffix ('%', 'h', '/10'…). NEVER read it directly: formatters.kpiUnit()
//   format        which formatter renders the value (lib/formatters.fmtKpiValue)
//   roles / sectors           who the KPI is offered to in KpiCustomizer
//   benchmark / recommended / inverse   thresholds, default picks, "lower is better"
//
// CURRENCY-ACCOUNT (04/09): a monetary KPI carries NO fixed unit — `unit: null` + `format:
// 'currency'`. Its symbol is the ACCOUNT's, resolved at render time by formatters.kpiUnit().
// Before this, these entries held a literal '€' that was printed next to a value fmtCurrency
// had already rendered in the account currency: "$1,200 €" on a USD account (error_list §5).
export const KPI_CATALOG = [
  // ── REVENUE ──
  { id: 'arr', label: 'kpi_library_arr', source: 'auto', category: 'revenue', unit: null, format: 'currency', roles: ['csm','kam','commercial','manager'], sectors: ['b2b','saas'] },
  { id: 'mrr', label: 'kpi_library_mrr', source: 'auto', category: 'revenue', unit: null, format: 'currency', roles: ['csm','kam','commercial','manager'], sectors: ['b2b','saas'] },
  { id: 'revenue_total', label: 'kpi_library_revenue_total', source: 'auto', category: 'revenue', unit: null, format: 'currency', roles: ['manager','commercial'], sectors: ['b2b','b2c','retail'] },
  { id: 'revenue_growth', label: 'kpi_library_revenue_growth', source: 'manual', aggregation: 'avg', category: 'revenue', unit: '%', format: 'percentage', roles: ['manager','commercial'], sectors: ['b2b','b2c'] },
  { id: 'acv', label: 'kpi_library_acv', source: 'manual', aggregation: 'avg', category: 'revenue', unit: null, format: 'currency', roles: ['commercial','kam'], sectors: ['b2b','saas'] },
  { id: 'ltv', label: 'kpi_library_ltv', source: 'manual', aggregation: 'avg', category: 'revenue', unit: null, format: 'currency', roles: ['csm','kam','manager'], sectors: ['b2b','b2c','saas'] },
  { id: 'ltv_cac', label: 'kpi_library_ltv_cac', source: 'manual', aggregation: 'avg', category: 'revenue', unit: 'x', format: 'ratio', roles: ['manager'], sectors: ['b2b','b2c','saas'] },
  { id: 'arpu', label: 'kpi_library_arpu', source: 'manual', aggregation: 'avg', category: 'revenue', unit: null, format: 'currency', roles: ['manager','commercial'], sectors: ['b2c','saas','marketplace'] },
  { id: 'gmv', label: 'kpi_library_gmv', source: 'manual', aggregation: 'sum', category: 'revenue', unit: null, format: 'currency', roles: ['manager','commercial'], sectors: ['marketplace','ecommerce'] },

  // ── RETENTION ──
  { id: 'nrr', label: 'kpi_library_nrr', source: 'auto', category: 'retention', unit: '%', format: 'percentage', roles: ['csm','kam','manager'], sectors: ['b2b','saas'], benchmark: { good: 100, excellent: 110, world_class: 130 }, recommended: true },
  { id: 'grr', label: 'kpi_library_grr', source: 'manual', aggregation: 'avg', category: 'retention', unit: '%', format: 'percentage', roles: ['csm','manager'], sectors: ['b2b','saas'] },
  { id: 'churn_rate', label: 'kpi_library_churn_rate', source: 'auto', category: 'retention', unit: '%', format: 'percentage', roles: ['csm','kam','manager'], sectors: ['b2b','b2c','saas'], benchmark: { good: 3, excellent: 1, alert: 7 }, recommended: true, inverse: true },
  { id: 'churn_revenue', label: 'kpi_library_churn_revenue', source: 'manual', aggregation: 'sum', category: 'retention', unit: null, format: 'currency', roles: ['csm','manager'], sectors: ['b2b','saas'], inverse: true },
  { id: 'renewal_rate', label: 'kpi_library_renewal_rate', source: 'manual', aggregation: 'avg', category: 'retention', unit: '%', format: 'percentage', roles: ['csm','kam'], sectors: ['b2b','saas'] },
  { id: 'logo_retention', label: 'kpi_library_logo_retention', source: 'manual', aggregation: 'avg', category: 'retention', unit: '%', format: 'percentage', roles: ['csm','manager'], sectors: ['b2b','saas'] },
  { id: 'time_to_churn', label: 'kpi_library_time_to_churn', source: 'manual', aggregation: 'avg', category: 'retention', unit: 'j', format: 'days', roles: ['csm','manager'], sectors: ['b2b','saas'], inverse: true },

  // ── SATISFACTION ──
  { id: 'nps', label: 'kpi_library_nps', source: 'auto', category: 'satisfaction', unit: '', format: 'score', roles: ['csm','kam','manager'], sectors: ['b2b','b2c'], benchmark: { good: 30, excellent: 50, world_class: 70 }, recommended: true },
  { id: 'csat', label: 'kpi_library_csat', source: 'manual', aggregation: 'avg', category: 'satisfaction', unit: '%', format: 'percentage', roles: ['csm','support','manager'], sectors: ['b2b','b2c'] },
  { id: 'ces', label: 'kpi_library_ces', source: 'manual', aggregation: 'avg', category: 'satisfaction', unit: '/7', format: 'score', roles: ['csm','support'], sectors: ['b2b','b2c'] },
  { id: 'health_score', label: 'kpi_library_health_score', source: 'auto', category: 'satisfaction', unit: '/10', format: 'score', roles: ['csm','kam','manager'], sectors: ['b2b','saas'], recommended: true },
  { id: 'promoters_pct', label: 'kpi_library_promoters_pct', source: 'manual', aggregation: 'avg', category: 'satisfaction', unit: '%', format: 'percentage', roles: ['csm','manager'], sectors: ['b2b','b2c'] },

  // ── ACQUISITION ──
  { id: 'new_clients', label: 'kpi_library_new_clients', source: 'auto', category: 'acquisition', unit: '', format: 'number', roles: ['commercial','manager'], sectors: ['b2b','b2c'] },
  { id: 'cac', label: 'kpi_library_cac', source: 'manual', aggregation: 'avg', category: 'acquisition', unit: null, format: 'currency', roles: ['commercial','manager'], sectors: ['b2b','b2c'], inverse: true },
  { id: 'conversion_rate', label: 'kpi_library_conversion_rate', source: 'manual', aggregation: 'avg', category: 'acquisition', unit: '%', format: 'percentage', roles: ['commercial','manager'], sectors: ['b2b','b2c'] },
  { id: 'win_rate', label: 'kpi_library_win_rate', source: 'auto', category: 'acquisition', unit: '%', format: 'percentage', roles: ['commercial','kam'], sectors: ['b2b'] },
  { id: 'pipeline_value', label: 'kpi_library_pipeline_value', source: 'auto', category: 'acquisition', unit: null, format: 'currency', roles: ['commercial','manager'], sectors: ['b2b'] },
  { id: 'sales_cycle', label: 'kpi_library_sales_cycle', source: 'manual', aggregation: 'avg', category: 'acquisition', unit: 'j', format: 'days', roles: ['commercial','manager'], sectors: ['b2b'], inverse: true },

  // ── EXPANSION ──
  { id: 'expansion_rate', label: 'kpi_library_expansion_rate', source: 'manual', aggregation: 'avg', category: 'expansion', unit: '%', format: 'percentage', roles: ['csm','kam','manager'], sectors: ['b2b','saas'] },
  { id: 'arr_expansion', label: 'kpi_library_arr_expansion', source: 'manual', aggregation: 'sum', category: 'expansion', unit: null, format: 'currency', roles: ['csm','kam'], sectors: ['b2b','saas'] },
  { id: 'upsell_rate', label: 'kpi_library_upsell_rate', source: 'manual', aggregation: 'avg', category: 'expansion', unit: '%', format: 'percentage', roles: ['csm','kam','commercial'], sectors: ['b2b','saas'] },
  { id: 'cross_sell_rate', label: 'kpi_library_cross_sell_rate', source: 'manual', aggregation: 'avg', category: 'expansion', unit: '%', format: 'percentage', roles: ['csm','kam','commercial'], sectors: ['b2b'] },

  // ── ACTIVATION ──
  { id: 'time_to_value', label: 'kpi_library_time_to_value', source: 'manual', aggregation: 'avg', category: 'activation', unit: 'j', format: 'days', roles: ['csm'], sectors: ['b2b','saas'], inverse: true },
  { id: 'activation_rate', label: 'kpi_library_activation_rate', source: 'manual', aggregation: 'avg', category: 'activation', unit: '%', format: 'percentage', roles: ['csm','manager'], sectors: ['b2b','saas'] },
  { id: 'feature_adoption', label: 'kpi_library_feature_adoption', source: 'manual', aggregation: 'avg', category: 'activation', unit: '%', format: 'percentage', roles: ['csm'], sectors: ['saas'] },
  { id: 'dau_mau', label: 'kpi_library_dau_mau', source: 'manual', aggregation: 'avg', category: 'activation', unit: '%', format: 'percentage', roles: ['csm','manager'], sectors: ['saas','b2c'] },
  { id: 'active_users', label: 'kpi_library_active_users', source: 'auto', category: 'activation', unit: '', format: 'number', roles: ['csm','manager'], sectors: ['saas','b2c'] },

  // ── CS TEAM ──
  { id: 'accounts_per_csm', label: 'kpi_library_accounts_per_csm', source: 'auto', category: 'team', unit: '', format: 'number', roles: ['manager'], sectors: ['b2b','saas'] },
  { id: 'arr_per_csm', label: 'kpi_library_arr_per_csm', source: 'auto', category: 'team', unit: null, format: 'currency', roles: ['manager'], sectors: ['b2b','saas'] },
  { id: 'team_wellbeing', label: 'kpi_library_team_wellbeing', source: 'manual', aggregation: 'avg', category: 'team', unit: '/10', format: 'score', roles: ['manager'], sectors: ['b2b','b2c'] },
  { id: 'qbr_completion', label: 'kpi_library_qbr_completion', source: 'manual', aggregation: 'avg', category: 'team', unit: '%', format: 'percentage', roles: ['csm','manager'], sectors: ['b2b','saas'] },
  { id: 'response_time', label: 'kpi_library_response_time', source: 'manual', aggregation: 'avg', category: 'team', unit: 'h', format: 'hours', roles: ['csm','support'], sectors: ['b2b','b2c'], inverse: true },

  // ── SUPPORT ──
  { id: 'tickets_open', label: 'kpi_library_tickets_open', source: 'manual', aggregation: 'sum', category: 'support', unit: '', format: 'number', roles: ['support','csm','manager'], sectors: ['b2b','b2c'], inverse: true },
  { id: 'resolution_time', label: 'kpi_library_resolution_time', source: 'manual', aggregation: 'avg', category: 'support', unit: 'h', format: 'hours', roles: ['support','manager'], sectors: ['b2b','b2c'], inverse: true },
  { id: 'fcr', label: 'kpi_library_fcr', source: 'manual', aggregation: 'avg', category: 'support', unit: '%', format: 'percentage', roles: ['support','manager'], sectors: ['b2b','b2c'] },

  // ── ENGAGEMENT ──
  { id: 'email_open_rate', label: 'kpi_library_email_open_rate', source: 'manual', aggregation: 'avg', category: 'engagement', unit: '%', format: 'percentage', roles: ['csm','commercial'], sectors: ['b2b','b2c'] },
  { id: 'meeting_show_rate', label: 'kpi_library_meeting_show_rate', source: 'manual', aggregation: 'avg', category: 'engagement', unit: '%', format: 'percentage', roles: ['csm','commercial'], sectors: ['b2b'] },
  { id: 'engagement_score', label: 'kpi_library_engagement_score', source: 'manual', aggregation: 'avg', category: 'engagement', unit: '/100', format: 'score', roles: ['csm','manager'], sectors: ['b2b','b2c'] },

  // ── E-COMMERCE ──
  { id: 'cart_abandonment', label: 'kpi_library_cart_abandonment', source: 'manual', aggregation: 'avg', category: 'ecommerce', unit: '%', format: 'percentage', roles: ['commercial','manager'], sectors: ['ecommerce','b2c'], inverse: true },
  { id: 'repeat_purchase', label: 'kpi_library_repeat_purchase', source: 'manual', aggregation: 'avg', category: 'ecommerce', unit: '%', format: 'percentage', roles: ['commercial','manager'], sectors: ['ecommerce','b2c','retail'] },
  { id: 'aov', label: 'kpi_library_aov', source: 'manual', aggregation: 'avg', category: 'ecommerce', unit: null, format: 'currency', roles: ['commercial','manager'], sectors: ['ecommerce','b2c','retail'] },

  // ── PROJECTS ──
  { id: 'projects_on_time', label: 'kpi_library_projects_on_time', source: 'manual', aggregation: 'avg', category: 'projects', unit: '%', format: 'percentage', roles: ['manager','csm'], sectors: ['b2b','b2c'] },
  { id: 'tasks_completion', label: 'kpi_library_tasks_completion', source: 'auto', category: 'projects', unit: '%', format: 'percentage', roles: ['manager','csm'], sectors: ['b2b','b2c'] },
  { id: 'estimation_accuracy', label: 'kpi_library_estimation_accuracy', source: 'manual', aggregation: 'avg', category: 'projects', unit: '%', format: 'percentage', roles: ['manager'], sectors: ['b2b'] },
]

// Categories: `icon` is an emoji, not a translatable string — it stays here.
export const KPI_CATEGORIES = [
  { id: 'revenue', icon: '📈', label: 'kpi_library_category_revenue' },
  { id: 'retention', icon: '🎯', label: 'kpi_library_category_retention' },
  { id: 'satisfaction', icon: '💚', label: 'kpi_library_category_satisfaction' },
  { id: 'acquisition', icon: '🚀', label: 'kpi_library_category_acquisition' },
  { id: 'expansion', icon: '📊', label: 'kpi_library_category_expansion' },
  { id: 'activation', icon: '⚡', label: 'kpi_library_category_activation' },
  { id: 'team', icon: '👥', label: 'kpi_library_category_team' },
  { id: 'support', icon: '🎧', label: 'kpi_library_category_support' },
  { id: 'engagement', icon: '📞', label: 'kpi_library_category_engagement' },
  { id: 'ecommerce', icon: '🛒', label: 'kpi_library_category_ecommerce' },
  { id: 'projects', icon: '📁', label: 'kpi_library_category_projects' },
]

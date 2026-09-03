export const KPI_CATALOG = [
  // ── REVENUS ──
  { id: 'arr', source: 'auto', label: 'ARR', labelEN: 'ARR', labelKO: '연간 반복 수익', cat: 'revenue', unit: '€', format: 'currency', roles: ['csm','kam','commercial','manager'], sectors: ['b2b','saas'] },
  { id: 'mrr', source: 'auto', label: 'MRR', labelEN: 'MRR', labelKO: '월간 반복 수익', cat: 'revenue', unit: '€', format: 'currency', roles: ['csm','kam','commercial','manager'], sectors: ['b2b','saas'] },
  { id: 'revenue_total', source: 'auto', label: 'CA Total', labelEN: 'Total Revenue', labelKO: '총 매출', cat: 'revenue', unit: '€', format: 'currency', roles: ['manager','commercial'], sectors: ['b2b','b2c','retail'] },
  { id: 'revenue_growth', source: 'manual', agg: 'avg', label: 'Croissance CA', labelEN: 'Revenue Growth', labelKO: '매출 성장률', cat: 'revenue', unit: '%', format: 'percentage', roles: ['manager','commercial'], sectors: ['b2b','b2c'] },
  { id: 'acv', source: 'manual', agg: 'avg', label: 'ACV', labelEN: 'ACV', labelKO: '연간 계약 가치', cat: 'revenue', unit: '€', format: 'currency', roles: ['commercial','kam'], sectors: ['b2b','saas'] },
  { id: 'ltv', source: 'manual', agg: 'avg', label: 'LTV', labelEN: 'LTV', labelKO: '고객 생애 가치', cat: 'revenue', unit: '€', format: 'currency', roles: ['csm','kam','manager'], sectors: ['b2b','b2c','saas'] },
  { id: 'ltv_cac', source: 'manual', agg: 'avg', label: 'LTV/CAC', labelEN: 'LTV/CAC', labelKO: 'LTV/CAC', cat: 'revenue', unit: 'x', format: 'ratio', roles: ['manager'], sectors: ['b2b','b2c','saas'] },
  { id: 'arpu', source: 'manual', agg: 'avg', label: 'ARPU', labelEN: 'ARPU', labelKO: '사용자당 평균 수익', cat: 'revenue', unit: '€', format: 'currency', roles: ['manager','commercial'], sectors: ['b2c','saas','marketplace'] },
  { id: 'gmv', source: 'manual', agg: 'sum', label: 'GMV', labelEN: 'GMV', labelKO: '총 상품 거래량', cat: 'revenue', unit: '€', format: 'currency', roles: ['manager','commercial'], sectors: ['marketplace','ecommerce'] },

  // ── RÉTENTION ──
  { id: 'nrr', source: 'auto', label: 'NRR', labelEN: 'NRR', labelKO: '순 수익 유지율', cat: 'retention', unit: '%', format: 'percentage', roles: ['csm','kam','manager'], sectors: ['b2b','saas'], benchmark: { good: 100, excellent: 110, world_class: 130 }, recommended: true },
  { id: 'grr', source: 'manual', agg: 'avg', label: 'GRR', labelEN: 'GRR', labelKO: '총 수익 유지율', cat: 'retention', unit: '%', format: 'percentage', roles: ['csm','manager'], sectors: ['b2b','saas'] },
  { id: 'churn_rate', source: 'auto', label: 'Taux de Churn', labelEN: 'Churn Rate', labelKO: '이탈률', cat: 'retention', unit: '%', format: 'percentage', roles: ['csm','kam','manager'], sectors: ['b2b','b2c','saas'], benchmark: { good: 3, excellent: 1, alert: 7 }, recommended: true, inverse: true },
  { id: 'churn_revenue', source: 'manual', agg: 'sum', label: 'Churn Revenue', labelEN: 'Revenue Churn', labelKO: '수익 이탈', cat: 'retention', unit: '€', format: 'currency', roles: ['csm','manager'], sectors: ['b2b','saas'], inverse: true },
  { id: 'renewal_rate', source: 'manual', agg: 'avg', label: 'Taux Renouvellement', labelEN: 'Renewal Rate', labelKO: '갱신률', cat: 'retention', unit: '%', format: 'percentage', roles: ['csm','kam'], sectors: ['b2b','saas'] },
  { id: 'logo_retention', source: 'manual', agg: 'avg', label: 'Logo Retention', labelEN: 'Logo Retention', labelKO: '고객 유지율', cat: 'retention', unit: '%', format: 'percentage', roles: ['csm','manager'], sectors: ['b2b','saas'] },
  { id: 'time_to_churn', source: 'manual', agg: 'avg', label: 'Temps avant Churn', labelEN: 'Time to Churn', labelKO: '이탈까지 시간', cat: 'retention', unit: 'j', format: 'days', roles: ['csm','manager'], sectors: ['b2b','saas'], inverse: true },

  // ── SATISFACTION ──
  { id: 'nps', source: 'auto', label: 'NPS', labelEN: 'NPS', labelKO: '순 추천 지수', cat: 'satisfaction', unit: '', format: 'score', roles: ['csm','kam','manager'], sectors: ['b2b','b2c'], benchmark: { good: 30, excellent: 50, world_class: 70 }, recommended: true },
  { id: 'csat', source: 'manual', agg: 'avg', label: 'CSAT', labelEN: 'CSAT', labelKO: '고객 만족도', cat: 'satisfaction', unit: '%', format: 'percentage', roles: ['csm','support','manager'], sectors: ['b2b','b2c'] },
  { id: 'ces', source: 'manual', agg: 'avg', label: 'CES', labelEN: 'CES', labelKO: '고객 노력 점수', cat: 'satisfaction', unit: '/7', format: 'score', roles: ['csm','support'], sectors: ['b2b','b2c'] },
  { id: 'health_score', source: 'auto', label: 'Health Score', labelEN: 'Health Score', labelKO: '건강 점수', cat: 'satisfaction', unit: '/10', format: 'score', roles: ['csm','kam','manager'], sectors: ['b2b','saas'], recommended: true },
  { id: 'promoters_pct', source: 'manual', agg: 'avg', label: 'Promoteurs NPS', labelEN: 'NPS Promoters', labelKO: 'NPS 추천자', cat: 'satisfaction', unit: '%', format: 'percentage', roles: ['csm','manager'], sectors: ['b2b','b2c'] },

  // ── ACQUISITION ──
  { id: 'new_clients', source: 'auto', label: 'Nouveaux Clients', labelEN: 'New Clients', labelKO: '신규 고객', cat: 'acquisition', unit: '', format: 'number', roles: ['commercial','manager'], sectors: ['b2b','b2c'] },
  { id: 'cac', source: 'manual', agg: 'avg', label: 'CAC', labelEN: 'CAC', labelKO: '고객 획득 비용', cat: 'acquisition', unit: '€', format: 'currency', roles: ['commercial','manager'], sectors: ['b2b','b2c'], inverse: true },
  { id: 'conversion_rate', source: 'manual', agg: 'avg', label: 'Taux Conversion', labelEN: 'Conversion Rate', labelKO: '전환율', cat: 'acquisition', unit: '%', format: 'percentage', roles: ['commercial','manager'], sectors: ['b2b','b2c'] },
  { id: 'win_rate', source: 'auto', label: 'Win Rate', labelEN: 'Win Rate', labelKO: '수주율', cat: 'acquisition', unit: '%', format: 'percentage', roles: ['commercial','kam'], sectors: ['b2b'] },
  { id: 'pipeline_value', source: 'auto', label: 'Pipeline', labelEN: 'Pipeline Value', labelKO: '파이프라인', cat: 'acquisition', unit: '€', format: 'currency', roles: ['commercial','manager'], sectors: ['b2b'] },
  { id: 'sales_cycle', source: 'manual', agg: 'avg', label: 'Cycle de Vente', labelEN: 'Sales Cycle', labelKO: '영업 주기', cat: 'acquisition', unit: 'j', format: 'days', roles: ['commercial','manager'], sectors: ['b2b'], inverse: true },

  // ── EXPANSION ──
  { id: 'expansion_rate', source: 'manual', agg: 'avg', label: 'Taux Expansion', labelEN: 'Expansion Rate', labelKO: '확장률', cat: 'expansion', unit: '%', format: 'percentage', roles: ['csm','kam','manager'], sectors: ['b2b','saas'] },
  { id: 'arr_expansion', source: 'manual', agg: 'sum', label: 'ARR Expansion', labelEN: 'Expansion ARR', labelKO: '확장 ARR', cat: 'expansion', unit: '€', format: 'currency', roles: ['csm','kam'], sectors: ['b2b','saas'] },
  { id: 'upsell_rate', source: 'manual', agg: 'avg', label: 'Taux Upsell', labelEN: 'Upsell Rate', labelKO: '업셀 비율', cat: 'expansion', unit: '%', format: 'percentage', roles: ['csm','kam','commercial'], sectors: ['b2b','saas'] },
  { id: 'cross_sell_rate', source: 'manual', agg: 'avg', label: 'Taux Cross-sell', labelEN: 'Cross-sell Rate', labelKO: '크로스셀 비율', cat: 'expansion', unit: '%', format: 'percentage', roles: ['csm','kam','commercial'], sectors: ['b2b'] },

  // ── ACTIVATION ──
  { id: 'time_to_value', source: 'manual', agg: 'avg', label: 'Time to Value', labelEN: 'Time to Value', labelKO: '가치 실현 시간', cat: 'activation', unit: 'j', format: 'days', roles: ['csm'], sectors: ['b2b','saas'], inverse: true },
  { id: 'activation_rate', source: 'manual', agg: 'avg', label: 'Taux Activation', labelEN: 'Activation Rate', labelKO: '활성화율', cat: 'activation', unit: '%', format: 'percentage', roles: ['csm','manager'], sectors: ['b2b','saas'] },
  { id: 'feature_adoption', source: 'manual', agg: 'avg', label: 'Adoption Features', labelEN: 'Feature Adoption', labelKO: '기능 채택률', cat: 'activation', unit: '%', format: 'percentage', roles: ['csm'], sectors: ['saas'] },
  { id: 'dau_mau', source: 'manual', agg: 'avg', label: 'DAU/MAU', labelEN: 'DAU/MAU', labelKO: 'DAU/MAU', cat: 'activation', unit: '%', format: 'percentage', roles: ['csm','manager'], sectors: ['saas','b2c'] },
  { id: 'active_users', source: 'auto', label: 'Utilisateurs Actifs', labelEN: 'Active Users', labelKO: '활성 사용자', cat: 'activation', unit: '', format: 'number', roles: ['csm','manager'], sectors: ['saas','b2c'] },

  // ── ÉQUIPE CS ──
  { id: 'accounts_per_csm', source: 'auto', label: 'Comptes/CSM', labelEN: 'Accounts per CSM', labelKO: 'CSM당 계정', cat: 'team', unit: '', format: 'number', roles: ['manager'], sectors: ['b2b','saas'] },
  { id: 'arr_per_csm', source: 'auto', label: 'ARR/CSM', labelEN: 'ARR per CSM', labelKO: 'CSM당 ARR', cat: 'team', unit: '€', format: 'currency', roles: ['manager'], sectors: ['b2b','saas'] },
  { id: 'team_wellbeing', source: 'manual', agg: 'avg', label: 'Bien-être Équipe', labelEN: 'Team Wellbeing', labelKO: '팀 웰빙', cat: 'team', unit: '/10', format: 'score', roles: ['manager'], sectors: ['b2b','b2c'] },
  { id: 'qbr_completion', source: 'manual', agg: 'avg', label: 'QBRs Réalisés', labelEN: 'QBR Completion', labelKO: 'QBR 완료율', cat: 'team', unit: '%', format: 'percentage', roles: ['csm','manager'], sectors: ['b2b','saas'] },
  { id: 'response_time', source: 'manual', agg: 'avg', label: 'Temps Réponse', labelEN: 'Response Time', labelKO: '응답 시간', cat: 'team', unit: 'h', format: 'hours', roles: ['csm','support'], sectors: ['b2b','b2c'], inverse: true },

  // ── SUPPORT ──
  { id: 'tickets_open', source: 'manual', agg: 'sum', label: 'Tickets Ouverts', labelEN: 'Open Tickets', labelKO: '열린 티켓', cat: 'support', unit: '', format: 'number', roles: ['support','csm','manager'], sectors: ['b2b','b2c'], inverse: true },
  { id: 'resolution_time', source: 'manual', agg: 'avg', label: 'Délai Résolution', labelEN: 'Resolution Time', labelKO: '해결 시간', cat: 'support', unit: 'h', format: 'hours', roles: ['support','manager'], sectors: ['b2b','b2c'], inverse: true },
  { id: 'fcr', source: 'manual', agg: 'avg', label: 'FCR', labelEN: 'FCR', labelKO: '첫 접촉 해결률', cat: 'support', unit: '%', format: 'percentage', roles: ['support','manager'], sectors: ['b2b','b2c'] },

  // ── ENGAGEMENT ──
  { id: 'email_open_rate', source: 'manual', agg: 'avg', label: 'Taux Ouverture Email', labelEN: 'Email Open Rate', labelKO: '이메일 열람률', cat: 'engagement', unit: '%', format: 'percentage', roles: ['csm','commercial'], sectors: ['b2b','b2c'] },
  { id: 'meeting_show_rate', source: 'manual', agg: 'avg', label: 'Taux Présence RDV', labelEN: 'Meeting Show Rate', labelKO: '미팅 참석률', cat: 'engagement', unit: '%', format: 'percentage', roles: ['csm','commercial'], sectors: ['b2b'] },
  { id: 'engagement_score', source: 'manual', agg: 'avg', label: 'Score Engagement', labelEN: 'Engagement Score', labelKO: '참여 점수', cat: 'engagement', unit: '/100', format: 'score', roles: ['csm','manager'], sectors: ['b2b','b2c'] },

  // ── E-COMMERCE ──
  { id: 'cart_abandonment', source: 'manual', agg: 'avg', label: 'Abandon Panier', labelEN: 'Cart Abandonment', labelKO: '장바구니 이탈률', cat: 'ecommerce', unit: '%', format: 'percentage', roles: ['commercial','manager'], sectors: ['ecommerce','b2c'], inverse: true },
  { id: 'repeat_purchase', source: 'manual', agg: 'avg', label: 'Rachat', labelEN: 'Repeat Purchase Rate', labelKO: '재구매율', cat: 'ecommerce', unit: '%', format: 'percentage', roles: ['commercial','manager'], sectors: ['ecommerce','b2c','retail'] },
  { id: 'aov', source: 'manual', agg: 'avg', label: 'Panier Moyen', labelEN: 'Avg Order Value', labelKO: '평균 주문 금액', cat: 'ecommerce', unit: '€', format: 'currency', roles: ['commercial','manager'], sectors: ['ecommerce','b2c','retail'] },

  // ── PROJETS ──
  { id: 'projects_on_time', source: 'manual', agg: 'avg', label: 'Projets dans les délais', labelEN: 'Projects on Time', labelKO: '기한 내 프로젝트', cat: 'projects', unit: '%', format: 'percentage', roles: ['manager','csm'], sectors: ['b2b','b2c'] },
  { id: 'tasks_completion', source: 'auto', label: 'Tâches Terminées', labelEN: 'Tasks Completed', labelKO: '완료 작업', cat: 'projects', unit: '%', format: 'percentage', roles: ['manager','csm'], sectors: ['b2b','b2c'] },
  { id: 'estimation_accuracy', source: 'manual', agg: 'avg', label: 'Précision Estimations', labelEN: 'Estimation Accuracy', labelKO: '추정 정확도', cat: 'projects', unit: '%', format: 'percentage', roles: ['manager'], sectors: ['b2b'] },
]

export const KPI_CATEGORIES = [
  { id: 'revenue', icon: '📈', labelFR: 'Revenus & Croissance', labelEN: 'Revenue & Growth', labelKO: '수익 및 성장' },
  { id: 'retention', icon: '🎯', labelFR: 'Rétention', labelEN: 'Retention', labelKO: '고객 유지' },
  { id: 'satisfaction', icon: '💚', labelFR: 'Satisfaction', labelEN: 'Satisfaction', labelKO: '만족도' },
  { id: 'acquisition', icon: '🚀', labelFR: 'Acquisition', labelEN: 'Acquisition', labelKO: '고객 획득' },
  { id: 'expansion', icon: '📊', labelFR: 'Expansion', labelEN: 'Expansion', labelKO: '확장' },
  { id: 'activation', icon: '⚡', labelFR: 'Activation', labelEN: 'Activation', labelKO: '활성화' },
  { id: 'team', icon: '👥', labelFR: 'Équipe CS', labelEN: 'CS Team', labelKO: 'CS 팀' },
  { id: 'support', icon: '🎧', labelFR: 'Support', labelEN: 'Support', labelKO: '지원' },
  { id: 'engagement', icon: '📞', labelFR: 'Engagement', labelEN: 'Engagement', labelKO: '참여' },
  { id: 'ecommerce', icon: '🛒', labelFR: 'E-commerce', labelEN: 'E-commerce', labelKO: '이커머스' },
  { id: 'projects', icon: '📁', labelFR: 'Projets', labelEN: 'Projects', labelKO: '프로젝트' },
]

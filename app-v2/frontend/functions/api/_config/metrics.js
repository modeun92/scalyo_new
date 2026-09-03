// Single source of truth for metric definitions.
// Used by AI prompts (dashboard, coach) to explain metrics to users.
// Adding a metric = add an entry here. The AI prompt builds itself from this config.

export const METRICS = {
  arr: {
    label: { fr: 'ARR Portefeuille', en: 'Portfolio ARR', ko: '포트폴리오 ARR' },
    description: {
      fr: "Somme de l'ARR (Annual Recurring Revenue) de tous les clients actifs du portfolio.",
      en: 'Sum of Annual Recurring Revenue across all active clients in the portfolio.',
      ko: '포트폴리오 내 모든 활성 고객의 연간 반복 수익 합계.'
    },
    type: 'realtime'
  },
  health_score: {
    label: { fr: 'Score Sante', en: 'Health Score', ko: '건강 점수' },
    description: {
      fr: 'Moyenne des health scores (1-10) de tous les clients. En dessous de 5 = portfolio en alerte.',
      en: 'Average health score (1-10) across all clients. Below 5 = portfolio at risk.',
      ko: '모든 고객의 건강 점수(1-10) 평균. 5 미만 = 위험.'
    },
    type: 'realtime'
  },
  churn_rate: {
    label: { fr: 'Taux de Churn', en: 'Churn Rate', ko: '이탈률' },
    description: {
      fr: "Pourcentage de clients reellement perdus (churned_at renseigne) sur la periode, divise par le nombre de clients en debut de periode. 0% = aucun client perdu. Ce n'est PAS le score de risque (churn_risk).",
      en: 'Percentage of clients actually lost (churned_at set) during the period, divided by client count at period start. 0% = no clients lost. NOT the risk score (churn_risk).',
      ko: '기간 내 실제 이탈 고객(churned_at 설정) 비율. 0% = 이탈 없음.'
    },
    type: 'period',
    requires: 'churned_at column on clients table'
  },
  nps: {
    label: { fr: 'NPS', en: 'NPS', ko: 'NPS' },
    description: {
      fr: 'Moyenne du Net Promoter Score de tous les clients. Au-dessus de 40 = excellent, en dessous de 20 = preoccupant.',
      en: 'Average Net Promoter Score across all clients. Above 40 = excellent, below 20 = concerning.',
      ko: '모든 고객의 NPS 평균. 40 이상 = 우수, 20 미만 = 우려.'
    },
    type: 'realtime'
  },
  nrr: {
    label: { fr: 'NRR', en: 'NRR', ko: 'NRR' },
    description: {
      fr: "Net Revenue Retention : ARR actuel des clients existants en debut de periode / leur ARR en debut de periode. Au-dessus de 100% = expansion. Affiche un tiret si pas assez de donnees historiques (snapshots). Les donnees s'accumulent automatiquement jour apres jour.",
      en: "Net Revenue Retention: current ARR of clients existing at period start / their ARR at period start. Above 100% = expansion. Shows dash if insufficient historical data (snapshots). Data accumulates automatically day by day.",
      ko: "순수익 유지율: 기간 초 기존 고객의 현재 ARR / 기간 초 ARR. 100% 이상 = 확장. 스냅샷 데이터 부족 시 대시 표시."
    },
    type: 'period',
    requires: 'historical snapshots (accumulate daily)'
  },
  active_users: {
    label: { fr: 'Utilisateurs Actifs', en: 'Active Users', ko: '활성 사용자' },
    description: {
      fr: 'Nombre de comptes clients non critiques dans le portfolio.',
      en: 'Number of non-critical client accounts in the portfolio.',
      ko: '포트폴리오 내 비위험 고객 계정 수.'
    },
    type: 'realtime'
  },
  churn_risk: {
    label: { fr: 'Score de Risque', en: 'Risk Score', ko: '위험 점수' },
    description: {
      fr: "Indicateur predictif par client (0-100). Ce n'est PAS le taux de churn. C'est une estimation du risque futur. Un score eleve necessite une action preventive.",
      en: "Predictive indicator per client (0-100). NOT the churn rate. Estimates future risk. High score requires preventive action.",
      ko: "고객별 예측 지표(0-100). 이탈률이 아님. 높은 점수 = 예방 조치 필요."
    },
    type: 'predictive'
  }
}

// Build a localized metric explanation block for AI prompts
export function getMetricsContext(lang = 'fr') {
  return Object.values(METRICS)
    .map(m => m.label[lang] + ' : ' + m.description[lang])
    .join('\n- ')
}

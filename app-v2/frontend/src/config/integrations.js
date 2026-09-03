/**
 * Integration Registry — Source of truth for all available integrations
 * Each user connects their own account via API key / webhook URL
 */

export const CATEGORIES = {
  crm: { id: 'crm', icon: 'ti-address-book', label: { fr: 'CRM', en: 'CRM', ko: 'CRM' } },
  communication: { id: 'communication', icon: 'ti-message', label: { fr: 'Communication', en: 'Communication', ko: '커뮤니케이션' } },
  support: { id: 'support', icon: 'ti-headset', label: { fr: 'Support', en: 'Support', ko: '지원' } },
  analytics: { id: 'analytics', icon: 'ti-chart-bar', label: { fr: 'Analytics', en: 'Analytics', ko: '분석' } },
  automation: { id: 'automation', icon: 'ti-robot', label: { fr: 'Automatisation', en: 'Automation', ko: '자동화' } },
  calendar: { id: 'calendar', icon: 'ti-calendar', label: { fr: 'Calendrier', en: 'Calendar', ko: '캘린더' } },
  project: { id: 'project', icon: 'ti-layout-kanban', label: { fr: 'Gestion de projet', en: 'Project management', ko: '프로젝트 관리' } }
}

export const CAPABILITY_TYPES = {
  sync_contacts: { icon: 'ti-users', label: { fr: 'Sync contacts', en: 'Sync contacts', ko: '연락처 동기화' } },
  send_notification: { icon: 'ti-bell', label: { fr: 'Notifications', en: 'Notifications', ko: '알림' } },
  import_tickets: { icon: 'ti-ticket', label: { fr: 'Import tickets', en: 'Import tickets', ko: '티켓 가져오기' } },
  import_deals: { icon: 'ti-coin', label: { fr: 'Import deals', en: 'Import deals', ko: '거래 가져오기' } },
  import_usage: { icon: 'ti-chart-dots', label: { fr: 'Donn\u00e9es usage', en: 'Usage data', ko: '사용 데이터' } },
  import_issues: { icon: 'ti-bug', label: { fr: 'Import issues', en: 'Import issues', ko: '이슈 가져오기' } },
  send_email: { icon: 'ti-mail', label: { fr: 'Envoi email', en: 'Send email', ko: '이메일 전송' } },
  webhook_receive: { icon: 'ti-webhook', label: { fr: 'Webhooks', en: 'Webhooks', ko: '웹훅' } },
  calendar_sync: { icon: 'ti-calendar-event', label: { fr: 'Sync calendrier', en: 'Calendar sync', ko: '캘린더 동기화' } }
}

export const INTEGRATIONS = {
  slack: {
    id: 'slack', name: 'Slack', icon: 'ti-brand-slack', category: 'communication', color: '#4A154B', plan: 'growth', status: 'available',
    label: { fr: 'Recevez les alertes CS directement dans Slack.', en: 'Get CS alerts directly in Slack.', ko: 'Slack\uc5d0\uc11c CS \uc54c\ub9bc\uc744 \ubc1b\uc73c\uc138\uc694.' },
    capabilities: ['send_notification', 'webhook_receive'],
    fields: [
      { key: 'webhook_url', type: 'url', label: { fr: 'URL du Webhook Slack', en: 'Slack Webhook URL', ko: 'Slack Webhook URL' }, placeholder: 'https://hooks.slack.com/services/...' }
    ],
    helpUrl: 'https://api.slack.com/messaging/webhooks',
    setupSteps: { fr: '1. Ouvrez api.slack.com/apps\n2. Cr\u00e9ez une app \u2192 Incoming Webhooks \u2192 Activer\n3. Ajoutez un webhook vers un channel\n4. Copiez l\u2019URL ici', en: '1. Go to api.slack.com/apps\n2. Create an app \u2192 Incoming Webhooks \u2192 Enable\n3. Add webhook to a channel\n4. Paste the URL here', ko: '1. api.slack.com/apps \uc774\ub3d9\n2. \uc571 \uc0dd\uc131 \u2192 Incoming Webhooks \u2192 \ud65c\uc131\ud654\n3. \ucc44\ub110\uc5d0 \uc6f9\ud6c5 \ucd94\uac00\n4. URL\uc744 \uc5ec\uae30\uc5d0 \ubd99\uc5ec\ub123\uae30' }
  },
  hubspot: {
    id: 'hubspot', name: 'HubSpot', icon: 'ti-hexagon-letter-h', category: 'crm', color: '#FF7A59', plan: 'growth', status: 'available',
    label: { fr: 'Synchronisez vos contacts et deals HubSpot.', en: 'Sync your HubSpot contacts and deals.', ko: 'HubSpot \uc5f0\ub77d\ucc98\uc640 \uac70\ub798\ub97c \ub3d9\uae30\ud654\ud558\uc138\uc694.' },
    capabilities: ['sync_contacts', 'import_deals'],
    fields: [
      { key: 'api_key', type: 'password', label: { fr: 'Cl\u00e9 API (Private App)', en: 'API Key (Private App)', ko: 'API \ud0a4 (Private App)' }, placeholder: 'pat-...' }
    ],
    helpUrl: 'https://developers.hubspot.com/docs/api/private-apps',
    setupSteps: { fr: '1. HubSpot \u2192 Param\u00e8tres \u2192 Int\u00e9grations \u2192 Applications priv\u00e9es\n2. Cr\u00e9ez une app priv\u00e9e\n3. Scopes : crm.objects.contacts.read, crm.objects.deals.read\n4. Copiez le token ici', en: '1. HubSpot \u2192 Settings \u2192 Integrations \u2192 Private Apps\n2. Create a private app\n3. Scopes: crm.objects.contacts.read, crm.objects.deals.read\n4. Paste the token here', ko: '1. HubSpot \u2192 \uc124\uc815 \u2192 \ud1b5\ud569 \u2192 Private Apps\n2. Private App \uc0dd\uc131\n3. \ubc94\uc704: crm.objects.contacts.read, crm.objects.deals.read\n4. \ud1a0\ud070 \ubd99\uc5ec\ub123\uae30' }
  },
  intercom: {
    id: 'intercom', name: 'Intercom', icon: 'ti-message-dots', category: 'support', color: '#286EFA', plan: 'growth', status: 'available',
    label: { fr: 'Importez vos conversations et contacts Intercom.', en: 'Import your Intercom conversations and contacts.', ko: 'Intercom \ub300\ud654\uc640 \uc5f0\ub77d\ucc98\ub97c \uac00\uc838\uc624\uc138\uc694.' },
    capabilities: ['sync_contacts', 'import_tickets'],
    fields: [
      { key: 'api_key', type: 'password', label: { fr: 'Token d\u2019acc\u00e8s', en: 'Access Token', ko: '\uc561\uc138\uc2a4 \ud1a0\ud070' }, placeholder: 'dG9rOi...' }
    ],
    helpUrl: 'https://developers.intercom.com/docs/build-an-integration/learn-more/authentication',
    setupSteps: { fr: '1. Intercom \u2192 Settings \u2192 Integrations \u2192 Developer Hub\n2. Nouvelle app \u2192 Authentication\n3. Copiez le token ici', en: '1. Intercom \u2192 Settings \u2192 Integrations \u2192 Developer Hub\n2. New app \u2192 Authentication\n3. Paste the token here', ko: '1. Intercom \u2192 \uc124\uc815 \u2192 \ud1b5\ud569 \u2192 Developer Hub\n2. \uc0c8 \uc571 \u2192 Authentication\n3. \ud1a0\ud070 \ubd99\uc5ec\ub123\uae30' }
  },
  zendesk: {
    id: 'zendesk', name: 'Zendesk', icon: 'ti-headset', category: 'support', color: '#03363D', plan: 'growth', status: 'available',
    label: { fr: 'Importez vos tickets Zendesk.', en: 'Import your Zendesk tickets.', ko: 'Zendesk \ud2f0\ucf13\uc744 \uac00\uc838\uc624\uc138\uc694.' },
    capabilities: ['import_tickets'],
    fields: [
      { key: 'subdomain', type: 'text', label: { fr: 'Sous-domaine Zendesk', en: 'Zendesk subdomain', ko: 'Zendesk \uc11c\ube0c\ub3c4\uba54\uc778' }, placeholder: 'votre-entreprise' },
      { key: 'api_key', type: 'password', label: { fr: 'Token API', en: 'API Token', ko: 'API \ud1a0\ud070' }, placeholder: '...' }
    ],
    helpUrl: 'https://support.zendesk.com/hc/en-us/articles/4408889192858',
    setupSteps: { fr: '1. Zendesk Admin \u2192 Apps \u2192 API \u2192 Zendesk API\n2. Activez l\u2019acc\u00e8s par token\n3. Ajoutez un token API\n4. Copiez le sous-domaine et le token ici', en: '1. Zendesk Admin \u2192 Apps \u2192 API \u2192 Zendesk API\n2. Enable token access\n3. Add an API token\n4. Paste subdomain and token here', ko: '1. Zendesk Admin \u2192 Apps \u2192 API \u2192 Zendesk API\n2. \ud1a0\ud070 \uc561\uc138\uc2a4 \ud65c\uc131\ud654\n3. API \ud1a0\ud070 \ucd94\uac00\n4. \uc11c\ube0c\ub3c4\uba54\uc778\uacfc \ud1a0\ud070 \ubd99\uc5ec\ub123\uae30' }
  },
  salesforce: {
    id: 'salesforce', name: 'Salesforce', icon: 'ti-cloud', category: 'crm', color: '#00A1E0', plan: 'elite', status: 'available',
    label: { fr: 'Connectez Salesforce pour synchroniser vos comptes.', en: 'Connect Salesforce to sync your accounts.', ko: 'Salesforce\ub97c \uc5f0\uacb0\ud558\uc5ec \uacc4\uc815\uc744 \ub3d9\uae30\ud654\ud558\uc138\uc694.' },
    capabilities: ['sync_contacts', 'import_deals'],
    fields: [
      { key: 'instance_url', type: 'url', label: { fr: 'URL de l\u2019instance', en: 'Instance URL', ko: '\uc778\uc2a4\ud134\uc2a4 URL' }, placeholder: 'https://yourcompany.salesforce.com' },
      { key: 'api_key', type: 'password', label: { fr: 'Token de s\u00e9curit\u00e9', en: 'Security Token', ko: '\ubcf4\uc548 \ud1a0\ud070' }, placeholder: '...' }
    ],
    helpUrl: 'https://help.salesforce.com/s/articleView?id=sf.user_security_token.htm',
    setupSteps: { fr: '1. Salesforce \u2192 Mon profil \u2192 R\u00e9initialiser le token\n2. Copiez l\u2019URL et le token ici', en: '1. Salesforce \u2192 My Profile \u2192 Reset Security Token\n2. Paste URL and token here', ko: '1. Salesforce \u2192 \ub0b4 \ud504\ub85c\ud544 \u2192 \ubcf4\uc548 \ud1a0\ud070 \uc7ac\uc124\uc815\n2. URL\uacfc \ud1a0\ud070 \ubd99\uc5ec\ub123\uae30' }
  },
  jira: {
    id: 'jira', name: 'Jira', icon: 'ti-layout-kanban', category: 'project', color: '#0052CC', plan: 'growth', status: 'available',
    label: { fr: 'Importez vos issues Jira.', en: 'Import your Jira issues.', ko: 'Jira \uc774\uc288\ub97c \uac00\uc838\uc624\uc138\uc694.' },
    capabilities: ['import_issues'],
    fields: [
      { key: 'domain', type: 'text', label: { fr: 'Domaine Atlassian', en: 'Atlassian domain', ko: 'Atlassian \ub3c4\uba54\uc778' }, placeholder: 'votre-entreprise.atlassian.net' },
      { key: 'email', type: 'email', label: { fr: 'Email du compte', en: 'Account email', ko: '\uacc4\uc815 \uc774\uba54\uc77c' }, placeholder: 'vous@entreprise.com' },
      { key: 'api_key', type: 'password', label: { fr: 'Token API', en: 'API Token', ko: 'API \ud1a0\ud070' }, placeholder: '...' }
    ],
    helpUrl: 'https://id.atlassian.com/manage-profile/security/api-tokens',
    setupSteps: { fr: '1. id.atlassian.com \u2192 S\u00e9curit\u00e9 \u2192 Tokens API\n2. Cr\u00e9ez un token\n3. Copiez le domaine, email et token ici', en: '1. id.atlassian.com \u2192 Security \u2192 API Tokens\n2. Create a token\n3. Paste domain, email and token here', ko: '1. id.atlassian.com \u2192 \ubcf4\uc548 \u2192 API \ud1a0\ud070\n2. \ud1a0\ud070 \uc0dd\uc131\n3. \ub3c4\uba54\uc778, \uc774\uba54\uc77c, \ud1a0\ud070 \ubd99\uc5ec\ub123\uae30' }
  },
  zapier: {
    id: 'zapier', name: 'Zapier', icon: 'ti-bolt', category: 'automation', color: '#FF4F00', plan: 'growth', status: 'available',
    label: { fr: 'Automatisez avec Zapier via webhooks.', en: 'Automate with Zapier via webhooks.', ko: 'Zapier \uc6f9\ud6c5\uc73c\ub85c \uc790\ub3d9\ud654\ud558\uc138\uc694.' },
    capabilities: ['webhook_receive', 'send_notification'],
    fields: [
      { key: 'webhook_url', type: 'url', label: { fr: 'URL du Webhook Zapier', en: 'Zapier Webhook URL', ko: 'Zapier Webhook URL' }, placeholder: 'https://hooks.zapier.com/hooks/catch/...' }
    ],
    helpUrl: 'https://zapier.com/apps/webhook/integrations',
    setupSteps: { fr: '1. Zapier \u2192 Cr\u00e9ez un Zap\n2. Trigger : Webhooks by Zapier \u2192 Catch Hook\n3. Copiez l\u2019URL ici', en: '1. Zapier \u2192 Create a Zap\n2. Trigger: Webhooks by Zapier \u2192 Catch Hook\n3. Paste the URL here', ko: '1. Zapier \u2192 Zap \uc0dd\uc131\n2. \ud2b8\ub9ac\uac70: Webhooks by Zapier \u2192 Catch Hook\n3. URL \ubd99\uc5ec\ub123\uae30' }
  },
  google_calendar: {
    id: 'google_calendar', name: 'Google Calendar', icon: 'ti-calendar', category: 'calendar', color: '#4285F4', plan: 'growth', status: 'available',
    label: { fr: 'Synchronisez vos rendez-vous clients.', en: 'Sync your client meetings.', ko: '\uace0\uac1d \ubbf8\ud305\uc744 \ub3d9\uae30\ud654\ud558\uc138\uc694.' },
    capabilities: ['calendar_sync'],
    fields: [
      { key: 'calendar_id', type: 'email', label: { fr: 'ID du calendrier (email)', en: 'Calendar ID (email)', ko: '\uce98\ub9b0\ub354 ID (\uc774\uba54\uc77c)' }, placeholder: 'vous@gmail.com' },
      { key: 'api_key', type: 'password', label: { fr: 'Cl\u00e9 API Google', en: 'Google API Key', ko: 'Google API \ud0a4' }, placeholder: 'AIza...' }
    ],
    helpUrl: 'https://console.cloud.google.com/apis/credentials',
    setupSteps: { fr: '1. Google Cloud Console \u2192 APIs \u2192 Identifiants\n2. Cr\u00e9ez une cl\u00e9 API\n3. Activez Calendar API\n4. Copiez l\u2019ID calendrier et la cl\u00e9 ici', en: '1. Google Cloud Console \u2192 APIs \u2192 Credentials\n2. Create an API key\n3. Enable Calendar API\n4. Paste calendar ID and key here', ko: '1. Google Cloud Console \u2192 APIs \u2192 \uc790\uaca9\uc99d\uba85\n2. API \ud0a4 \uc0dd\uc131\n3. Calendar API \ud65c\uc131\ud654\n4. \uce98\ub9b0\ub354 ID\uc640 \ud0a4 \ubd99\uc5ec\ub123\uae30' }
  },
  mixpanel: {
    id: 'mixpanel', name: 'Mixpanel', icon: 'ti-chart-dots-3', category: 'analytics', color: '#7856FF', plan: 'elite', status: 'available',
    label: { fr: 'Importez vos donn\u00e9es produit Mixpanel.', en: 'Import your Mixpanel product data.', ko: 'Mixpanel \uc81c\ud488 \ub370\uc774\ud130\ub97c \uac00\uc838\uc624\uc138\uc694.' },
    capabilities: ['import_usage'],
    fields: [
      { key: 'project_id', type: 'text', label: { fr: 'Project ID', en: 'Project ID', ko: 'Project ID' }, placeholder: '123456' },
      { key: 'api_key', type: 'password', label: { fr: 'Service Account Secret', en: 'Service Account Secret', ko: 'Service Account Secret' }, placeholder: '...' }
    ],
    helpUrl: 'https://docs.mixpanel.com/docs/orgs-and-projects/managing-projects#service-accounts',
    setupSteps: { fr: '1. Mixpanel \u2192 Organization Settings \u2192 Service Accounts\n2. Cr\u00e9ez un compte de service\n3. Copiez le Project ID et le secret ici', en: '1. Mixpanel \u2192 Organization Settings \u2192 Service Accounts\n2. Create a service account\n3. Paste Project ID and secret here', ko: '1. Mixpanel \u2192 Organization Settings \u2192 Service Accounts\n2. \uc11c\ube44\uc2a4 \uacc4\uc815 \uc0dd\uc131\n3. Project ID\uc640 \uc2dc\ud06c\ub9bf \ubd99\uc5ec\ub123\uae30' }
  }
}

export function getIntegration(id) { return INTEGRATIONS[id] || null }

export function getIntegrationsByCategory(locale = 'fr') {
  const cats = {}
  for (const integ of Object.values(INTEGRATIONS)) {
    if (!cats[integ.category]) {
      const catDef = CATEGORIES[integ.category]
      cats[integ.category] = { id: integ.category, icon: catDef.icon, displayLabel: catDef.label[locale] || catDef.label.fr, integrations: [] }
    }
    cats[integ.category].integrations.push(integ)
  }
  return Object.values(cats)
}

export function getAvailableForPlan(plan) {
  const order = { starter: 0, growth: 1, elite: 2, enterprise: 3 }
  const level = order[plan] ?? -1
  return Object.values(INTEGRATIONS).filter(i => (order[i.plan] ?? 0) <= level)
}

export function getCapabilityInfo(capId, locale = 'fr') {
  const cap = CAPABILITY_TYPES[capId]
  if (!cap) return { icon: 'ti-plug', label: capId }
  return { icon: cap.icon, label: cap.label[locale] || cap.label.fr }
}

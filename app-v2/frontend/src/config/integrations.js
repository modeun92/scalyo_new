/**
 * Integration Registry — Source of truth for all available integrations
 * Each user connects their own account via API key / webhook URL
 *
 * INTEGRATIONS-I18N (04/09): every user-facing string here is an i18n KEY
 * (integration_category_* / integration_capability_* / integration_description_* / integration_field_* / integration_steps_*).
 * This file used to carry 49 inline { fr, en, ko } objects — a second translation
 * system next to i18n, invisible to check-i18n.mjs. What stays is machine data:
 * ids, icons, colors, plan tier, capability lists, field types, placeholders, help URLs.
 */

export const CATEGORIES = {
  crm: { id: 'crm', icon: 'ti-address-book', labelKey: 'integration_category_crm' },
  communication: { id: 'communication', icon: 'ti-message', labelKey: 'integration_category_communication' },
  support: { id: 'support', icon: 'ti-headset', labelKey: 'integration_category_support' },
  analytics: { id: 'analytics', icon: 'ti-chart-bar', labelKey: 'integration_category_analytics' },
  automation: { id: 'automation', icon: 'ti-robot', labelKey: 'integration_category_automation' },
  calendar: { id: 'calendar', icon: 'ti-calendar', labelKey: 'integration_category_calendar' },
  project: { id: 'project', icon: 'ti-layout-kanban', labelKey: 'integration_category_project' }
}

export const CAPABILITY_TYPES = {
  sync_contacts: { icon: 'ti-users', labelKey: 'integration_capability_sync_contacts' },
  send_notification: { icon: 'ti-bell', labelKey: 'integration_capability_send_notification' },
  import_tickets: { icon: 'ti-ticket', labelKey: 'integration_capability_import_tickets' },
  import_deals: { icon: 'ti-coin', labelKey: 'integration_capability_import_deals' },
  import_usage: { icon: 'ti-chart-dots', labelKey: 'integration_capability_import_usage' },
  import_issues: { icon: 'ti-bug', labelKey: 'integration_capability_import_issues' },
  send_email: { icon: 'ti-mail', labelKey: 'integration_capability_send_email' },
  webhook_receive: { icon: 'ti-webhook', labelKey: 'integration_capability_webhook_receive' },
  calendar_sync: { icon: 'ti-calendar-event', labelKey: 'integration_capability_calendar_sync' }
}

export const INTEGRATIONS = {
  slack: {
    id: 'slack', name: 'Slack', icon: 'ti-brand-slack', category: 'communication', color: '#4A154B', plan: 'growth', status: 'available',
    labelKey: 'integration_description_slack',
    capabilities: ['send_notification', 'webhook_receive'],
    fields: [
      { key: 'webhook_url', type: 'url', labelKey: 'integration_field_slack_webhook_url', placeholder: 'https://hooks.slack.com/services/...' }
    ],
    helpUrl: 'https://api.slack.com/messaging/webhooks',
    setupStepsKey: 'integration_steps_slack'
  },
  hubspot: {
    id: 'hubspot', name: 'HubSpot', icon: 'ti-hexagon-letter-h', category: 'crm', color: '#FF7A59', plan: 'growth', status: 'available',
    labelKey: 'integration_description_hubspot',
    capabilities: ['sync_contacts', 'import_deals'],
    fields: [
      { key: 'api_key', type: 'password', labelKey: 'integration_field_hubspot_api_key', placeholder: 'pat-...' }
    ],
    helpUrl: 'https://developers.hubspot.com/docs/api/private-apps',
    setupStepsKey: 'integration_steps_hubspot'
  },
  intercom: {
    id: 'intercom', name: 'Intercom', icon: 'ti-message-dots', category: 'support', color: '#286EFA', plan: 'growth', status: 'available',
    labelKey: 'integration_description_intercom',
    capabilities: ['sync_contacts', 'import_tickets'],
    fields: [
      { key: 'api_key', type: 'password', labelKey: 'integration_field_intercom_api_key', placeholder: 'dG9rOi...' }
    ],
    helpUrl: 'https://developers.intercom.com/docs/build-an-integration/learn-more/authentication',
    setupStepsKey: 'integration_steps_intercom'
  },
  zendesk: {
    id: 'zendesk', name: 'Zendesk', icon: 'ti-headset', category: 'support', color: '#03363D', plan: 'growth', status: 'available',
    labelKey: 'integration_description_zendesk',
    capabilities: ['import_tickets'],
    fields: [
      { key: 'subdomain', type: 'text', labelKey: 'integration_field_zendesk_subdomain', placeholder: 'votre-entreprise' },
      { key: 'api_key', type: 'password', labelKey: 'integration_field_zendesk_api_key', placeholder: '...' }
    ],
    helpUrl: 'https://support.zendesk.com/hc/en-us/articles/4408889192858',
    setupStepsKey: 'integration_steps_zendesk'
  },
  salesforce: {
    id: 'salesforce', name: 'Salesforce', icon: 'ti-cloud', category: 'crm', color: '#00A1E0', plan: 'elite', status: 'available',
    labelKey: 'integration_description_salesforce',
    capabilities: ['sync_contacts', 'import_deals'],
    fields: [
      { key: 'instance_url', type: 'url', labelKey: 'integration_field_salesforce_instance_url', placeholder: 'https://yourcompany.salesforce.com' },
      { key: 'api_key', type: 'password', labelKey: 'integration_field_salesforce_api_key', placeholder: '...' }
    ],
    helpUrl: 'https://help.salesforce.com/s/articleView?id=sf.user_security_token.htm',
    setupStepsKey: 'integration_steps_salesforce'
  },
  jira: {
    id: 'jira', name: 'Jira', icon: 'ti-layout-kanban', category: 'project', color: '#0052CC', plan: 'growth', status: 'available',
    labelKey: 'integration_description_jira',
    capabilities: ['import_issues'],
    fields: [
      { key: 'domain', type: 'text', labelKey: 'integration_field_jira_domain', placeholder: 'votre-entreprise.atlassian.net' },
      { key: 'email', type: 'email', labelKey: 'integration_field_jira_email', placeholder: 'vous@entreprise.com' },
      { key: 'api_key', type: 'password', labelKey: 'integration_field_jira_api_key', placeholder: '...' }
    ],
    helpUrl: 'https://id.atlassian.com/manage-profile/security/api-tokens',
    setupStepsKey: 'integration_steps_jira'
  },
  zapier: {
    id: 'zapier', name: 'Zapier', icon: 'ti-bolt', category: 'automation', color: '#FF4F00', plan: 'growth', status: 'available',
    labelKey: 'integration_description_zapier',
    capabilities: ['webhook_receive', 'send_notification'],
    fields: [
      { key: 'webhook_url', type: 'url', labelKey: 'integration_field_zapier_webhook_url', placeholder: 'https://hooks.zapier.com/hooks/catch/...' }
    ],
    helpUrl: 'https://zapier.com/apps/webhook/integrations',
    setupStepsKey: 'integration_steps_zapier'
  },
  google_calendar: {
    id: 'google_calendar', name: 'Google Calendar', icon: 'ti-calendar', category: 'calendar', color: '#4285F4', plan: 'growth', status: 'available',
    labelKey: 'integration_description_google_calendar',
    capabilities: ['calendar_sync'],
    fields: [
      { key: 'calendar_id', type: 'email', labelKey: 'integration_field_google_calendar_calendar_id', placeholder: 'vous@gmail.com' },
      { key: 'api_key', type: 'password', labelKey: 'integration_field_google_calendar_api_key', placeholder: 'AIza...' }
    ],
    helpUrl: 'https://console.cloud.google.com/apis/credentials',
    setupStepsKey: 'integration_steps_google_calendar'
  },
  mixpanel: {
    id: 'mixpanel', name: 'Mixpanel', icon: 'ti-chart-dots-3', category: 'analytics', color: '#7856FF', plan: 'elite', status: 'available',
    labelKey: 'integration_description_mixpanel',
    capabilities: ['import_usage'],
    fields: [
      { key: 'project_id', type: 'text', labelKey: 'integration_field_mixpanel_project_id', placeholder: '123456' },
      { key: 'api_key', type: 'password', labelKey: 'integration_field_mixpanel_api_key', placeholder: '...' }
    ],
    helpUrl: 'https://docs.mixpanel.com/docs/orgs-and-projects/managing-projects#service-accounts',
    setupStepsKey: 'integration_steps_mixpanel'
  }
}

export function getIntegration(id) { return INTEGRATIONS[id] || null }

// INTEGRATIONS-I18N (04/09): no `locale` parameter any more — this module returns i18n KEYS and the
// view renders them with t() (R25 §5: no t() outside a component). Passing a locale in here was how a
// second translation layer got built alongside i18n in the first place.
export function getIntegrationsByCategory() {
  const cats = {}
  for (const integ of Object.values(INTEGRATIONS)) {
    if (!cats[integ.category]) {
      const catDef = CATEGORIES[integ.category]
      cats[integ.category] = { id: integ.category, icon: catDef.icon, labelKey: catDef.labelKey, integrations: [] }
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

export function getCapabilityInfo(capId) {
  const cap = CAPABILITY_TYPES[capId]
  // unknown capability → the raw id, which t() will echo back unchanged: visible, never blank
  if (!cap) return { icon: 'ti-plug', labelKey: capId }
  return { icon: cap.icon, labelKey: cap.labelKey }
}

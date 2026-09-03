/**
 * Server-side integration config — OAuth URLs for backend endpoints
 * GDPR: tokens stored encrypted, deleted on user disconnect, no PII in logs
 */
// CR-8 (E-09) : intégrations à configuration manuelle — champs autorisés par provider.
// Les champs SECRET_FIELD_KEYS sont chiffrés AES-256-GCM avant stockage (jamais en clair).
// D4 (contrat validé) : une URL de webhook est une capacité d'écriture = credential.
export const MANUAL_FIELDS = {
  slack: ['webhook_url'],
  hubspot: ['api_key'],
  intercom: ['api_key'],
  zendesk: ['subdomain', 'api_key'],
  salesforce: ['instance_url', 'api_key'],
  jira: ['domain', 'email', 'api_key'],
  zapier: ['webhook_url'],
  google_calendar: ['calendar_id', 'api_key'],
  mixpanel: ['project_id', 'api_key'],
}

export const SECRET_FIELD_KEYS = ['api_key', 'webhook_url']

export const INTEGRATIONS = {
  slack: { oauth: { provider: 'slack', authUrl: 'https://slack.com/oauth/v2/authorize', tokenUrl: 'https://slack.com/api/oauth.v2.access', scopes: ['channels:read', 'chat:write', 'incoming-webhook'], envKey: 'SLACK_CLIENT_ID', envSecret: 'SLACK_CLIENT_SECRET' } },
  hubspot: { oauth: { provider: 'hubspot', authUrl: 'https://app.hubspot.com/oauth/authorize', tokenUrl: 'https://api.hubapi.com/oauth/v1/token', scopes: ['crm.objects.contacts.read', 'crm.objects.deals.read'], envKey: 'HUBSPOT_CLIENT_ID', envSecret: 'HUBSPOT_CLIENT_SECRET' } },
  intercom: { oauth: { provider: 'intercom', authUrl: 'https://app.intercom.com/oauth', tokenUrl: 'https://api.intercom.io/auth/eagle/token', scopes: ['read_conversations', 'read_contacts'], envKey: 'INTERCOM_CLIENT_ID', envSecret: 'INTERCOM_CLIENT_SECRET' } },
  zendesk: { oauth: { provider: 'zendesk', authUrl: 'https://{subdomain}.zendesk.com/oauth/authorizations/new', tokenUrl: 'https://{subdomain}.zendesk.com/oauth/tokens', scopes: ['read', 'tickets:read', 'users:read'], envKey: 'ZENDESK_CLIENT_ID', envSecret: 'ZENDESK_CLIENT_SECRET' } },
  salesforce: { oauth: { provider: 'salesforce', authUrl: 'https://login.salesforce.com/services/oauth2/authorize', tokenUrl: 'https://login.salesforce.com/services/oauth2/token', scopes: ['api', 'refresh_token'], envKey: 'SALESFORCE_CLIENT_ID', envSecret: 'SALESFORCE_CLIENT_SECRET' } },
  jira: { oauth: { provider: 'atlassian', authUrl: 'https://auth.atlassian.com/authorize', tokenUrl: 'https://auth.atlassian.com/oauth/token', scopes: ['read:jira-work', 'read:jira-user', 'offline_access'], envKey: 'JIRA_CLIENT_ID', envSecret: 'JIRA_CLIENT_SECRET' } },
  mixpanel: { oauth: { provider: 'mixpanel', authUrl: 'https://mixpanel.com/oauth/authorize', tokenUrl: 'https://mixpanel.com/oauth/access_token', scopes: ['read:insights', 'read:engage'], envKey: 'MIXPANEL_CLIENT_ID', envSecret: 'MIXPANEL_CLIENT_SECRET' } },
  google_calendar: { oauth: { provider: 'google', authUrl: 'https://accounts.google.com/o/oauth2/v2/auth', tokenUrl: 'https://oauth2.googleapis.com/token', scopes: ['https://www.googleapis.com/auth/calendar.readonly'], envKey: 'GOOGLE_CLIENT_ID', envSecret: 'GOOGLE_CLIENT_SECRET' } }
}

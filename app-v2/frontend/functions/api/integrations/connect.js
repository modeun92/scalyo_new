import { INTEGRATIONS } from '../_config/integrations-server.js'

export async function onRequestGet(context) {
  const { request, env } = context
  const url = new URL(request.url)
  const provider = url.searchParams.get('provider')
  const appUrl = url.origin + '/app/integrations'
  if (!provider || !INTEGRATIONS[provider]) return Response.redirect(appUrl + '?integration_error=invalid_provider', 302)
  const integration = INTEGRATIONS[provider]
  if (!integration.oauth?.authUrl) return Response.redirect(appUrl + '?integration_error=oauth_not_configured', 302)
  const clientId = env[integration.oauth.envKey]
  if (!clientId) return Response.redirect(appUrl + '?integration_error=not_configured', 302)
  const authHeader = request.headers.get('Authorization')
  if (!authHeader) return Response.redirect(appUrl + '?integration_error=unauthorized', 302)
  const supabaseUrl = env.SUPABASE_URL
    // ENV-FALLBACK-PROD (Lot 6): no more hard-coded fallback to the PRODUCTION database.
    if (!supabaseUrl) throw new Error('Missing required environment variable: SUPABASE_URL')
  const userRes = await fetch(supabaseUrl + '/auth/v1/user', { headers: { 'Authorization': authHeader, 'apikey': env.SUPABASE_SERVICE_ROLE_KEY } })
  if (!userRes.ok) return Response.redirect(appUrl + '?integration_error=unauthorized', 302)
  const user = await userRes.json()
  const state = btoa(JSON.stringify({ uid: user.id, provider, ts: Date.now() }))
  const redirectUri = url.origin + '/api/integrations/callback'
  const params = new URLSearchParams({ client_id: clientId, redirect_uri: redirectUri, scope: integration.oauth.scopes.join(' '), response_type: 'code', state })
  return Response.redirect(integration.oauth.authUrl + '?' + params.toString(), 302)
}

import { INTEGRATIONS } from '../_config/integrations-server.js'
import { encryptToken } from '../_config/crypto.js'

export async function onRequestGet(context) {
  const { request, env } = context
  const url = new URL(request.url)
  const code = url.searchParams.get('code')
  const stateParam = url.searchParams.get('state')
  const errorParam = url.searchParams.get('error')
  const appUrl = url.origin + '/app/integrations'
  if (errorParam) return Response.redirect(appUrl + '?integration_error=' + errorParam, 302)
  if (!code || !stateParam) return Response.redirect(appUrl + '?integration_error=missing_params', 302)
  let state
  try { state = JSON.parse(atob(stateParam)) } catch { return Response.redirect(appUrl + '?integration_error=invalid_state', 302) }
  const { uid, provider, ts } = state
  if (!uid || !provider || !INTEGRATIONS[provider]) return Response.redirect(appUrl + '?integration_error=invalid_state', 302)
  if (Date.now() - ts > 600000) return Response.redirect(appUrl + '?integration_error=expired', 302)
  const integration = INTEGRATIONS[provider]
  const clientId = env[integration.oauth.envKey]
  const clientSecret = env[integration.oauth.envSecret]
  if (!clientId || !clientSecret) return Response.redirect(appUrl + '?integration_error=not_configured', 302)
  try {
    const tokenRes = await fetch(integration.oauth.tokenUrl, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, code, redirect_uri: url.origin + '/api/integrations/callback', grant_type: 'authorization_code' }) })
    if (!tokenRes.ok) return Response.redirect(appUrl + '?integration_error=token_exchange_failed', 302)
    const tokens = await tokenRes.json()
    const encKey = env.ENCRYPTION_KEY || env.SUPABASE_SERVICE_ROLE_KEY
    const encAccessToken = await encryptToken(tokens.access_token, encKey)
    const encRefreshToken = await encryptToken(tokens.refresh_token, encKey)
    const supabaseUrl = env.SUPABASE_URL
    // ENV-FALLBACK-PROD (lot 6) : plus de repli en dur vers la base de PRODUCTION.
    if (!supabaseUrl) throw new Error('Missing required environment variable: SUPABASE_URL')
    const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY
    const saveRes = await fetch(supabaseUrl + '/rest/v1/org_integrations', { method: 'POST', headers: { 'Content-Type': 'application/json', 'apikey': serviceKey, 'Authorization': 'Bearer ' + serviceKey, 'Prefer': 'return=minimal' }, body: JSON.stringify({ user_id: uid, integration_id: provider, status: 'active', access_token: encAccessToken, refresh_token: encRefreshToken, token_expires_at: tokens.expires_in ? new Date(Date.now() + tokens.expires_in * 1000).toISOString() : null, provider_data: '{}', config: {}, connected_at: new Date().toISOString() }) })
    if (!saveRes.ok) return Response.redirect(appUrl + '?integration_error=save_failed', 302)
    return Response.redirect(appUrl + '?integration_connected=' + provider, 302)
  } catch { return Response.redirect(appUrl + '?integration_error=server_error', 302) }
}

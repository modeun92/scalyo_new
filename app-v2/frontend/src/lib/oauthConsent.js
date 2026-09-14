// Supabase OAuth 2.1 authorization-server calls for the Scalyo consent screen.
//
// OAUTH-CONSENT-SURFACE (14/09/2026): every call into Supabase's OAuth server lives HERE
// and nowhere else. That is deliberate — this is the part of the consent flow that cannot
// be verified against a real Supabase project from this repository (the frontend has no
// node_modules in this snapshot, and these authorization-server methods are recent
// additions to @supabase/supabase-js). Isolating them means correcting a call is a change
// in one file, not a hunt through a view.
//
// ARG SHAPE (14/09/2026, fourth review §3): these methods take the authorization id as a
// BARE STRING, not as `{ authorization_id }`. The object form was wrong and would have
// failed at the first live ChatGPT authorization — the one moment where a failure is most
// expensive, because the user is mid-way through granting access and sees only that
// "Scalyo is broken".
//
// NEVER SILENTLY SUCCEED. If the method is missing from the installed client, every
// function here throws `OAuthConsentUnavailableError` and the view shows an explicit
// failure. The alternative — a consent screen that swallows the error and renders an
// Allow button that does nothing, or worse appears to grant access — is the exact
// false-success class D-14/D-15 exist to prevent, on the one screen in the product where
// the user is granting a third party access to their customer data.
//
// Verify against the deployed @supabase/supabase-js before enabling the route in
// production: docs/MCP_CONSENT_PAGE.md §"Verifying the client API".

import { supabase } from '@/lib/supabase'

export class OAuthConsentUnavailableError extends Error {
  constructor(method) {
    super('Supabase OAuth authorization API not available: ' + method)
    this.name = 'OAuthConsentUnavailableError'
    this.method = method
  }
}

/**
 * The Supabase client namespace that carries the authorization-server methods.
 * Checked at call time rather than at import time so a missing API cannot break the
 * bundle for every other page.
 */
function oauthApi() {
  return supabase?.auth?.oauth || null
}

function requireMethod(name) {
  const api = oauthApi()
  if (!api || typeof api[name] !== 'function') throw new OAuthConsentUnavailableError(name)
  return api[name].bind(api)
}

/** True when the installed client can actually run this flow. The view checks this first. */
export function isOAuthConsentSupported() {
  const api = oauthApi()
  return Boolean(
    api &&
    typeof api.getAuthorizationDetails === 'function' &&
    typeof api.approveAuthorization === 'function' &&
    typeof api.denyAuthorization === 'function'
  )
}

/**
 * OAuth 2.0 `scope` is ONE space-delimited string ("openid email profile"), not an array
 * (fourth review §5). Reading it as an array yielded an empty list, so the consent screen
 * silently showed no requested scopes — the user was asked to approve an unspecified
 * grant. Both spellings are accepted because the screen must degrade to "no scopes
 * listed" rather than to a wrong list.
 */
export function parseScopes(data) {
  if (typeof data?.scope === 'string') return data.scope.trim().split(/\s+/).filter(Boolean)
  if (Array.isArray(data?.scopes)) return data.scopes.filter((s) => typeof s === 'string')
  return []
}

/**
 * What is being asked for, and by whom.
 *
 * Two outcomes, and they must be distinguished (fourth review §4):
 *   { status: 'consent_required', … }  render the consent screen
 *   { status: 'redirect', redirectUrl } the user has ALREADY authorized this client —
 *                                       hand control straight back, do not ask again
 *
 * Supabase signals the second by returning a payload with no `authorization_id`. Treating
 * it as the first showed a returning user a second consent form for a grant they had
 * already given, and the Allow button then had no pending authorization to approve.
 */
export async function getAuthorizationDetails(authorizationId) {
  if (!authorizationId) throw new Error('missing authorization_id')
  const call = requireMethod('getAuthorizationDetails')

  const { data, error } = await call(authorizationId)
  // D-14: an error is an error. Never fall through to a rendered consent screen with
  // empty fields — the user would be approving an unnamed application.
  if (error) throw error
  if (!data) throw new Error('authorization details returned no data')

  if (!('authorization_id' in data)) {
    const redirectUrl = data.redirect_url || data.redirect_to || data.url
    // Already-authorized with nowhere to send them is not a success we can act on.
    if (!redirectUrl) throw new Error('already-authorized response carried no redirect url')
    return { status: 'redirect', redirectUrl }
  }

  const client = data.client || data.client_info || {}
  return {
    status: 'consent_required',
    clientId: client.client_id || data.client_id || null,
    // Falls back to null, never to "an application" — the view decides how to render an
    // unknown client, and an invented name on a consent screen is a lie (R21).
    clientName: client.name || client.client_name || null,
    clientUri: client.client_uri || client.website || null,
    scopes: parseScopes(data),
    redirectUri: data.redirect_uri || null,
  }
}

/**
 * The user pressed Allow. Returns the URL to redirect to, which hands control back to
 * Supabase and on to the AI client.
 */
export async function approveAuthorization(authorizationId) {
  const call = requireMethod('approveAuthorization')
  const { data, error } = await call(authorizationId)
  if (error) throw error

  const url = data?.redirect_url || data?.redirect_to || data?.url
  // A 200 with no redirect URL is NOT a success: the browser would sit on the consent
  // screen while the AI client waits forever for a callback that never comes.
  if (!url) throw new Error('approve returned no redirect url')
  return url
}

/** The user pressed Cancel. Same contract as approve. */
export async function denyAuthorization(authorizationId) {
  const call = requireMethod('denyAuthorization')
  const { data, error } = await call(authorizationId)
  if (error) throw error
  // A deny with no redirect URL is survivable — the view falls back to its own message —
  // because nothing was granted. Approve above cannot make that trade.
  return data?.redirect_url || data?.redirect_to || data?.url || null
}

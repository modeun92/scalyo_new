// === SCALYO — Stripe Customer Portal ===
// POST /api/stripe/portal
// Creates a Stripe Billing Portal session for subscription management.

import { getConfig } from '../_config/index.js'
import { extractAuth, verifyJwt } from '../_services/auth.service.js'

async function getProfile(config, userId) {
  const url = config.supabaseUrl + '/rest/v1/profiles?id=eq.' + userId + '&select=id,stripe_customer_id'
  const res = await fetch(url, {
    headers: { 'apikey': config.supabaseServiceRoleKey, 'Authorization': 'Bearer ' + config.supabaseServiceRoleKey },
  })
  if (!res.ok) return null
  const rows = await res.json()
  return rows.length > 0 ? rows[0] : null
}

export async function onRequestPost(context) {
  const config = getConfig(context.env)
  const { token } = extractAuth(context.request)
  const jwt = await verifyJwt(token, config)

  if (!jwt.valid) {
    return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json' } })
  }
  if (!config.stripeSecretKey) {
    return new Response(JSON.stringify({ error: 'stripe_not_configured' }), { status: 503, headers: { 'Content-Type': 'application/json' } })
  }

  const profile = await getProfile(config, jwt.userId)
  if (!profile || !profile.stripe_customer_id) {
    return new Response(JSON.stringify({ error: 'no_subscription' }), { status: 400, headers: { 'Content-Type': 'application/json' } })
  }

  const params = new URLSearchParams()
  params.append('customer', profile.stripe_customer_id)
  params.append('return_url', 'https://scalyo.app/app/settings')

  const res = await fetch('https://api.stripe.com/v1/billing_portal/sessions', {
    method: 'POST',
    headers: { 'Authorization': 'Basic ' + btoa(config.stripeSecretKey + ':'), 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  })
  const data = await res.json()

  if (!res.ok) {
    return new Response(JSON.stringify({ error: 'portal_failed' }), { status: 502, headers: { 'Content-Type': 'application/json' } })
  }

  return new Response(JSON.stringify({ url: data.url }), { status: 200, headers: { 'Content-Type': 'application/json' } })
}
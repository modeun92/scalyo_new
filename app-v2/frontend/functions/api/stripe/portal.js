// === SCALYO — Stripe Customer Portal ===
// POST /api/stripe/portal
// Creates a Stripe Billing Portal session for subscription management.

import { getConfig } from '../_config/index.js'
import { extractAuth, verifyJwt } from '../_services/auth.service.js'
import { createSupabaseClient, getUserMembership } from '../_utils/supabase.js'

// CORE-V2-ME (04/10/2026): the Stripe customer is the ORGANIZATION's — its latest paid period's, else
// the one organizations still records (a checkout whose plan the webhook could not resolve leaves a
// customer and no period). Read from profiles, it was whoever paid, and only for themselves. Only the
// billing owner manages the subscription (canManageBilling); anyone else is refused, not sent to a
// portal that is not theirs.
async function getOrgCustomerId(db, membership) {
  const paid = await db.selectOne('subscription',
    'organization_id=eq.' + membership.core_organization_id
    + '&kind=eq.PAID&stripe_customer_id=not.is.null&order=issue_date.desc,id.desc&limit=1&select=stripe_customer_id')
  if (paid?.stripe_customer_id) return paid.stripe_customer_id
  const org = await db.selectOne('organizations', 'id=eq.' + membership.organization_id + '&select=stripe_customer_id')
  return org?.stripe_customer_id || null
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

  const db = createSupabaseClient(context.env)
  const membership = await getUserMembership(db, jwt.userId)
  if (membership && membership.role !== 'owner') {
    return new Response(JSON.stringify({ error: 'permission_denied' }), { status: 403, headers: { 'Content-Type': 'application/json' } })
  }
  const customerId = membership ? await getOrgCustomerId(db, membership) : null
  if (!customerId) {
    return new Response(JSON.stringify({ error: 'no_subscription' }), { status: 400, headers: { 'Content-Type': 'application/json' } })
  }

  const params = new URLSearchParams()
  params.append('customer', customerId)
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
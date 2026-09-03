// === SCALYO — Stripe Webhook Handler ===
// POST /api/stripe-webhook
// Verifies HMAC signature, updates user plan + seats in Supabase.

import { getConfig } from './_config/index.js'
// BILLING-SEAT (D3, 27/08/2026): the price table lives in _config/prices.js (single source);
// PRICE_TO_PLAN is derived from it, with the same 9 currency_amount → plan pairs as before.
import { planFromPrice } from './_config/prices.js'

// --- HMAC-SHA256 Stripe signature verification ---
async function verifyStripeSignature(rawBody, sigHeader, secret) {
  if (!sigHeader || !secret) return false
  const parts = {}
  for (const item of sigHeader.split(',')) {
    const [key, value] = item.split('=')
    parts[key] = value
  }
  const timestamp = parts.t
  const expectedSig = parts.v1
  if (!timestamp || !expectedSig) return false
  const now = Math.floor(Date.now() / 1000)
  if (Math.abs(now - parseInt(timestamp, 10)) > 300) return false
  const encoder = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw', encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  )
  const signatureBytes = await crypto.subtle.sign(
    'HMAC', key, encoder.encode(timestamp + '.' + rawBody)
  )
  const computed = Array.from(new Uint8Array(signatureBytes))
    .map(b => b.toString(16).padStart(2, '0')).join('')
  if (computed.length !== expectedSig.length) return false
  let result = 0
  for (let i = 0; i < computed.length; i++) {
    result |= computed.charCodeAt(i) ^ expectedSig.charCodeAt(i)
  }
  return result === 0
}
// --- Supabase helpers (service role key, bypasses RLS) ---
async function updateProfile(config, userId, updates) {
  const url = config.supabaseUrl + '/rest/v1/profiles?id=eq.' + userId
  const response = await fetch(url, {
    method: 'PATCH',
    headers: {
      'apikey': config.supabaseServiceRoleKey,
      'Authorization': 'Bearer ' + config.supabaseServiceRoleKey,
      'Content-Type': 'application/json',
      'Prefer': 'return=minimal',
    },
    body: JSON.stringify(updates),
  })
  return response.ok
}

// D2 (gating contract 8/07): the org is the single source of the effective plan (D1) —
// the webhook ALSO writes organizations (where owner_id = userId), otherwise the members
// of a paying owner stay gated on starter. service_role: the
// protect_org_billing_fields trigger is non-blocking (authenticated only).
async function updateOrgForOwner(config, userId, updates) {
  const url = config.supabaseUrl + '/rest/v1/organizations?owner_id=eq.' + userId
  const response = await fetch(url, {
    method: 'PATCH',
    headers: {
      'apikey': config.supabaseServiceRoleKey,
      'Authorization': 'Bearer ' + config.supabaseServiceRoleKey,
      'Content-Type': 'application/json',
      'Prefer': 'return=minimal',
    },
    body: JSON.stringify(updates),
  })
  return response.ok
}

async function findUserByCustomerId(config, customerId) {
  const url = config.supabaseUrl + '/rest/v1/profiles?stripe_customer_id=eq.' + customerId + '&select=id'
  const response = await fetch(url, {
    headers: {
      'apikey': config.supabaseServiceRoleKey,
      'Authorization': 'Bearer ' + config.supabaseServiceRoleKey,
    },
  })
  if (!response.ok) return null
  const rows = await response.json()
  return rows.length > 0 ? rows[0].id : null
}

// --- Event handlers ---
// CR-3 A1: webhook payloads NEVER include line_items (only via
// the API with expand). Without a re-fetch, a checkout with a trial (amount_total=0)
// resolves no plan → no provisioning.
async function fetchSessionWithLineItems(config, sessionId) {
  if (!config.stripeSecretKey || !sessionId) return null
  const r = await fetch('https://api.stripe.com/v1/checkout/sessions/' + sessionId + '?expand[]=line_items', {
    headers: { 'Authorization': 'Bearer ' + config.stripeSecretKey },
  })
  if (!r.ok) return null
  return r.json()
}

async function handleCheckoutCompleted(session, config) {
  const userId = session.client_reference_id
  if (!userId) return false
  let lineItems = session.line_items?.data || []
  if (!lineItems.length) {
    const full = await fetchSessionWithLineItems(config, session.id)
    if (full?.line_items?.data?.length) lineItems = full.line_items.data
  }
  const item = lineItems[0]
  let plan = null
  let seatsPaid = 1
  if (item?.price) {
    plan = planFromPrice(item.price.currency, item.price.unit_amount)
    seatsPaid = item.quantity || 1
  }
  // Fallback: session-level currency + amount_total / quantity (0 on a trial → unresolved)
  if (!plan && session.currency && session.amount_total) {
    const qty = lineItems[0]?.quantity || 1
    const unitAmount = Math.round(session.amount_total / qty)
    plan = planFromPrice(session.currency, unitAmount)
    seatsPaid = qty
  }
  // CR-3 A1: always set customer/subscription — even if the plan stays
  // unresolved here, customer.subscription.updated will be able to catch up via customer_id.
  const base = {
    stripe_subscription_id: session.subscription || null,
    stripe_customer_id: session.customer || null,
    trial_used: true,
  }
  if (!plan) {
    const ok = await updateProfile(config, userId, base)
    await updateOrgForOwner(config, userId, { stripe_subscription_id: base.stripe_subscription_id, stripe_customer_id: base.stripe_customer_id })
    return ok
  }
  const ok = await updateProfile(config, userId, { ...base, plan, seats_paid: seatsPaid })
  await updateOrgForOwner(config, userId, { plan, seats_paid: seatsPaid, stripe_subscription_id: base.stripe_subscription_id, stripe_customer_id: base.stripe_customer_id })
  return ok
}
async function handleSubscriptionUpdated(subscription, config) {
  const customerId = subscription.customer
  const userId = await findUserByCustomerId(config, customerId)
  if (!userId) return false
  if (subscription.status === 'canceled' || subscription.status === 'unpaid') {
    const ok = await updateProfile(config, userId, {
      plan: null, seats_paid: 0, stripe_subscription_id: null,
      subscription_end_date: subscription.current_period_end ? new Date(subscription.current_period_end * 1000).toISOString() : null,
    })
    // D2: org.plan NOT NULL -> back to the starter floor (a still-valid promo
    // access is carried by trial_ends_at, which is not touched here)
    await updateOrgForOwner(config, userId, { plan: 'starter', seats_paid: 1, stripe_subscription_id: null })
    return ok
  }
  const items = subscription.items?.data || []
  const item = items[0]
  if (!item?.price) return false
  const plan = planFromPrice(item.price.currency, item.price.unit_amount)
  if (!plan) return false
  const ok = await updateProfile(config, userId, {
    plan, seats_paid: item.quantity || 1, stripe_subscription_id: subscription.id,
      subscription_end_date: subscription.current_period_end ? new Date(subscription.current_period_end * 1000).toISOString() : null,
  })
  await updateOrgForOwner(config, userId, { plan, seats_paid: item.quantity || 1, stripe_subscription_id: subscription.id, stripe_customer_id: customerId })
  return ok
}

async function handleSubscriptionDeleted(subscription, config) {
  const customerId = subscription.customer
  const userId = await findUserByCustomerId(config, customerId)
  if (!userId) return false
  const ok = await updateProfile(config, userId, {
    plan: null, seats_paid: 0, stripe_subscription_id: null,
      subscription_end_date: subscription.current_period_end ? new Date(subscription.current_period_end * 1000).toISOString() : null,
  })
  await updateOrgForOwner(config, userId, { plan: 'starter', seats_paid: 1, stripe_subscription_id: null })
  return ok
}

// --- Main handler (POST only) ---
export async function onRequestPost(context) {
  const config = getConfig(context.env)
  if (!config.stripeWebhookSecret) {
    return new Response(JSON.stringify({ error: 'Webhook not configured' }), {
      status: 503, headers: { 'Content-Type': 'application/json' },
    })
  }
  if (!config.supabaseServiceRoleKey) {
    return new Response(JSON.stringify({ error: 'Service role not configured' }), {
      status: 503, headers: { 'Content-Type': 'application/json' },
    })
  }
  const rawBody = await context.request.text()
  const sigHeader = context.request.headers.get('stripe-signature')
  const isValid = await verifyStripeSignature(rawBody, sigHeader, config.stripeWebhookSecret)
  if (!isValid) {
    return new Response(JSON.stringify({ error: 'Invalid signature' }), {
      status: 400, headers: { 'Content-Type': 'application/json' },
    })
  }
  let event
  try { event = JSON.parse(rawBody) }
  catch { return new Response(JSON.stringify({ error: 'Invalid payload' }), {
    status: 400, headers: { 'Content-Type': 'application/json' },
  })}
  const obj = event.data?.object
  if (!obj) {
    return new Response(JSON.stringify({ received: true }), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    })
  }
  let handled = false
  switch (event.type) {
    case 'checkout.session.completed':
      handled = await handleCheckoutCompleted(obj, config)
      break
    case 'customer.subscription.updated':
      handled = await handleSubscriptionUpdated(obj, config)
      break
    case 'customer.subscription.deleted':
      handled = await handleSubscriptionDeleted(obj, config)
      break
  }
  return new Response(JSON.stringify({ received: true, handled }), {
    status: 200, headers: { 'Content-Type': 'application/json' },
  })
}
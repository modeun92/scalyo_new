// GET /api/billing — BILLING-SEAT (contract 2.1, 27/08/2026): the displayed price is the billed price.
// The server decides everything: role (D1), source (real Stripe data if subscribed, otherwise table × seats),
// currency, amounts in MAJOR units. The front end carries no price and only displays what it receives.
import { jsonResponse, errorResponse } from './_utils/response.js'
import { createSupabaseClient, getAuthUser, getUserMembership } from './_utils/supabase.js'
import { stripeRequest } from './_utils/stripe.js'
import { canPerform } from './_config/plans.config.js'
import { pricesFor, planFromPrice, toMajor, normalizeCurrency, BILLING_INTERVAL } from './_config/prices.js'
import { t } from './_i18n/translate.js'

function isoFromUnix(seconds) {
  return seconds ? new Date(seconds * 1000).toISOString() : null
}

// CURRENCY-ORG (24/09/2026): the ORGANIZATION's currency (core_v2 company.currency_code, reached
// through the organizations.core_organization_id bridge) — it was the person's own
// user_profiles.currency (decision 18/07), so two teammates could be quoted the same plan in two
// currencies. Missing/invalid → null (→ EUR default); an account with no organization has none.
async function organizationCurrency(db, account) {
  try {
    if (!account?.core_organization_id) return null
    const row = await db.selectOne('company', 'id=eq.' + account.core_organization_id)
    return normalizeCurrency(row?.currency_code)
  } catch (_) {
    return null
  }
}

// Real next charge (proration + discount included). Independent of the account's API version:
// create_preview (≥ 2025-03-31.basil) then fallback to invoices/upcoming (earlier versions).
async function upcomingInvoice(secretKey, subscriptionId, currency, request) {
  const q = 'subscription=' + encodeURIComponent(subscriptionId)
  let inv = await request(secretKey, 'POST', '/invoices/create_preview', q)
  if (!inv.ok) inv = await request(secretKey, 'GET', '/invoices/upcoming?' + q)
  if (!inv.ok || typeof inv.data.total !== 'number') return null
  const discount = (inv.data.total_discount_amounts || []).reduce((sum, d) => sum + (d.amount || 0), 0)
  return {
    total: toMajor(inv.data.total, currency),
    discount: toMajor(discount, currency),
    date: isoFromUnix(inv.data.next_payment_attempt || inv.data.period_end),
  }
}

// Read of the real subscription. Returning null = Stripe unreachable or subscription unusable → table.
export async function readStripeSubscription(secretKey, subscriptionId, request = stripeRequest) {
  const sub = await request(secretKey, 'GET', '/subscriptions/' + encodeURIComponent(subscriptionId))
  const item = sub.ok ? sub.data.items?.data?.[0] : null
  if (!item?.price) return null
  const currency = normalizeCurrency(item.price.currency)
  if (!currency) return null
  const quantity = item.quantity || 1
  const unitAmount = toMajor(item.price.unit_amount, currency)
  // current_period_end: on the subscription before basil, on the item since (2025-03-31).
  const periodEnd = sub.data.current_period_end ?? item.current_period_end ?? null
  return {
    currency,
    unit_amount: unitAmount,
    seats: quantity,
    total: unitAmount == null ? null : unitAmount * quantity,
    interval: item.price.recurring?.interval || BILLING_INTERVAL,
    status: sub.data.status || null,
    period_end: isoFromUnix(periodEnd),
    cancel_at_period_end: !!sub.data.cancel_at_period_end,
    plan: planFromPrice(item.price.currency, item.price.unit_amount),
    upcoming: await upcomingInvoice(secretKey, subscriptionId, currency, request),
  }
}

// Amounts outside a Stripe subscription: single table × seats, in the account currency. Enterprise → quote-based.
export function tableBilling(plan, seats, currency) {
  const grid = pricesFor(currency)
  const unit = grid.prices[plan] ?? null
  return {
    currency: grid.currency,
    unit_amount: unit,
    seats,
    total: unit == null ? null : unit * seats,
    interval: BILLING_INTERVAL,
    status: null,
    period_end: null,
    cancel_at_period_end: false,
    plan,
    upcoming: null,
    prices: grid.prices,
  }
}

export async function onRequestGet(context) {
  const { request, env } = context
  try {
    const user = await getAuthUser(request, env)
    if (!user) return errorResponse(401, t('unauthorized'))
    const db = createSupabaseClient(env)
    const membership = await getUserMembership(db, user.id)

    // OWN-ORG (27/09/2026): every account has an organization — the profiles fallback for an org-less
    // account is gone with profiles (stage 2).
    if (!membership) return errorResponse(404, 'No billing account')
    const role = membership.role
    const account = await db.selectOne('organizations', 'id=eq.' + membership.organization_id)
    if (!account) return errorResponse(404, 'No billing account')

    // CORE-V2-ME (04/10/2026): the plan and the Stripe subscription are the organization's CURRENT
    // PERIOD (core_v2), the same answer the screen gets from core_v2_me. No period: no plan to price.
    let period = null
    try { period = await db.rpc('core_v2_current_subscription', { p_org: membership.core_organization_id }) } catch (_) { period = null }
    if (!period || !period.id) period = null
    const orgPlan = period?.type ? String(period.type).toLowerCase() : null
    const stripeSubscriptionId = period?.kind === 'PAID' ? period.stripe_subscription_id : null
    const canViewAmounts = canPerform(role, 'canViewBilling')
    const seats = period?.kind === 'PAID' && period.seats != null ? period.seats : (account.seats_paid ?? 1)
    const base = {
      role,
      can_view_amounts: canViewAmounts,
      org_plan: orgPlan,
      plan: orgPlan,
      seats,
      interval: BILLING_INTERVAL,
      has_subscription: !!stripeSubscriptionId,
    }
    // D1: member / viewer — plan and seats, never an amount.
    if (!canViewAmounts) return jsonResponse({ ...base, source: 'none' })

    let stripe = null
    if (stripeSubscriptionId && env.STRIPE_SECRET_KEY) {
      stripe = await readStripeSubscription(env.STRIPE_SECRET_KEY, stripeSubscriptionId)
    }
    if (stripe) {
      const grid = pricesFor(stripe.currency)
      return jsonResponse({
        ...base,
        ...stripe,
        source: 'stripe',
        plan: stripe.plan || orgPlan,
        plan_mismatch: !!stripe.plan && stripe.plan !== orgPlan,
        currency: stripe.currency.toUpperCase(),
        prices: grid.prices,
      })
    }
    const table = tableBilling(orgPlan, seats, await organizationCurrency(db, account))
    return jsonResponse({ ...base, ...table, source: 'table', plan_mismatch: false, currency: table.currency.toUpperCase() })
  } catch (err) {
    return errorResponse(500, err.message || 'Server error')
  }
}

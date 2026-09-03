// GET /api/billing — BILLING-SEAT (contrat 2.1, 27/08/2026) : le prix affiché est le prix facturé.
// Le serveur décide de tout : rôle (D1), source (Stripe réel si abonnement, sinon table × sièges),
// devise, montants en unité MAJEURE. Le front ne porte aucun prix et n'affiche que ce qu'il reçoit.
import { jsonResponse, errorResponse } from './_utils/response.js'
import { createSupabaseClient, getAuthUser, getUserMembership } from './_utils/supabase.js'
import { stripeRequest } from './_utils/stripe.js'
import { canPerform } from './_config/plans.config.js'
import { pricesFor, planFromPrice, toMajor, normalizeCurrency, BILLING_INTERVAL } from './_config/prices.js'
import { t } from './_i18n/messages.js'

function isoFromUnix(seconds) {
  return seconds ? new Date(seconds * 1000).toISOString() : null
}

// Devise du COMPTE (user_profiles.currency, arbitrage 18/07) — absente/invalide → null (→ défaut EUR).
async function accountCurrency(db, userId) {
  try {
    const row = await db.selectOne('user_profiles', 'id=eq.' + userId)
    return normalizeCurrency(row?.currency)
  } catch (_) {
    return null
  }
}

// Prochain prélèvement réel (prorata + remise inclus). Indépendant de la version d'API du compte :
// create_preview (≥ 2025-03-31.basil) puis repli invoices/upcoming (versions antérieures).
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

// Lecture de l'abonnement réel. Retour null = Stripe injoignable ou abonnement inexploitable → table.
export async function readStripeSubscription(secretKey, subscriptionId, request = stripeRequest) {
  const sub = await request(secretKey, 'GET', '/subscriptions/' + encodeURIComponent(subscriptionId))
  const item = sub.ok ? sub.data.items?.data?.[0] : null
  if (!item?.price) return null
  const currency = normalizeCurrency(item.price.currency)
  if (!currency) return null
  const quantity = item.quantity || 1
  const unitAmount = toMajor(item.price.unit_amount, currency)
  // current_period_end : sur l'abonnement avant basil, sur l'item depuis (2025-03-31).
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

// Montants hors abonnement Stripe : table unique × sièges, dans la devise du compte. Enterprise → sur devis.
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

    // Compte sans org (historique) : son propre abonnement, il en est le titulaire.
    let role = 'owner'
    let account = null
    if (membership) {
      role = membership.role
      account = await db.selectOne('organizations', 'id=eq.' + membership.organization_id)
    } else {
      account = await db.selectOne('profiles', 'id=eq.' + user.id)
    }
    if (!account) return errorResponse(404, 'No billing account')

    const canViewAmounts = canPerform(role, 'canViewBilling')
    const orgPlan = account.plan || 'starter'
    const seats = account.seats_paid ?? 1
    const base = {
      role,
      can_view_amounts: canViewAmounts,
      org_plan: orgPlan,
      plan: orgPlan,
      seats,
      interval: BILLING_INTERVAL,
      has_subscription: !!account.stripe_subscription_id,
    }
    // D1 : member / viewer — plan et sièges, jamais un montant.
    if (!canViewAmounts) return jsonResponse({ ...base, source: 'none' })

    let stripe = null
    if (account.stripe_subscription_id && env.STRIPE_SECRET_KEY) {
      stripe = await readStripeSubscription(env.STRIPE_SECRET_KEY, account.stripe_subscription_id)
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
    const table = tableBilling(orgPlan, seats, await accountCurrency(db, user.id))
    return jsonResponse({ ...base, ...table, source: 'table', plan_mismatch: false, currency: table.currency.toUpperCase() })
  } catch (err) {
    return errorResponse(500, err.message || 'Server error')
  }
}

// Stripe REST helper — synchronization of the seat count (per-seat billing)
// SEAT-AT-ACCEPT (03/10/2026): accept an invitation = bill a seat (create_prorations).
// Remove = decrement the quantity without a credit (proration_behavior: 'none' → effect at end of month).

export async function stripeRequest(secretKey, method, path, body) {
  const res = await fetch('https://api.stripe.com/v1' + path, {
    method,
    headers: {
      'Authorization': 'Basic ' + btoa(secretKey + ':'),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: body || undefined,
  })
  return { ok: res.ok, status: res.status, data: await res.json().catch(() => ({})) }
}

// Adjusts the subscription's seat quantity to `quantity`.
// prorationBehavior: 'create_prorations' (addition, billed pro rata immediately)
//                  | 'none' (removal, no credit, the new quantity applies at the next renewal)
// Returns: { ok: true, quantity } | { ok: false, error }
export async function setSubscriptionQuantity(secretKey, subscriptionId, quantity, prorationBehavior) {
  if (!secretKey) return { ok: false, error: 'stripe_not_configured' }
  if (!subscriptionId) return { ok: false, error: 'no_subscription' }
  const sub = await stripeRequest(secretKey, 'GET', '/subscriptions/' + subscriptionId)
  if (!sub.ok || !sub.data.items?.data?.length) return { ok: false, error: 'stripe_subscription_not_found' }
  const itemId = sub.data.items.data[0].id
  // Already right: no update, so no proration line and no subscription.updated event. Callers
  // re-sync to the recounted truth after the fact, and that is usually a no-op.
  if (sub.data.items.data[0].quantity === quantity) return { ok: true, quantity }
  const upd = await stripeRequest(secretKey, 'POST', '/subscriptions/' + subscriptionId,
    'items[0][id]=' + encodeURIComponent(itemId)
    + '&items[0][quantity]=' + quantity
    + '&proration_behavior=' + prorationBehavior)
  if (!upd.ok) return { ok: false, error: upd.data.error?.message || 'stripe_update_failed' }
  return { ok: true, quantity }
}

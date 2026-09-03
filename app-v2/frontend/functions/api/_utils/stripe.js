// Stripe REST helper — synchronisation du nombre de sièges (facturation per-seat, modèle GitHub)
// Inviter = accorder le rôle + facturer un siège immédiatement (create_prorations).
// Retirer  = décrémenter la quantité sans crédit (proration_behavior: 'none' → effet fin de mois).

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

// Ajuste la quantité de sièges de l'abonnement à `quantity`.
// prorationBehavior : 'create_prorations' (ajout, facturé au prorata immédiatement)
//                   | 'none' (retrait, pas de crédit, nouvelle quantité appliquée à la prochaine échéance)
// Retour : { ok: true, quantity } | { ok: false, error }
export async function setSubscriptionQuantity(secretKey, subscriptionId, quantity, prorationBehavior) {
  if (!secretKey) return { ok: false, error: 'stripe_not_configured' }
  if (!subscriptionId) return { ok: false, error: 'no_subscription' }
  const sub = await stripeRequest(secretKey, 'GET', '/subscriptions/' + subscriptionId)
  if (!sub.ok || !sub.data.items?.data?.length) return { ok: false, error: 'stripe_subscription_not_found' }
  const itemId = sub.data.items.data[0].id
  const upd = await stripeRequest(secretKey, 'POST', '/subscriptions/' + subscriptionId,
    'items[0][id]=' + encodeURIComponent(itemId)
    + '&items[0][quantity]=' + quantity
    + '&proration_behavior=' + prorationBehavior)
  if (!upd.ok) return { ok: false, error: upd.data.error?.message || 'stripe_update_failed' }
  return { ok: true, quantity }
}

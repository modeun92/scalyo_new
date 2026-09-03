// === Stripe Payment Links — single source, injected per environment (CR-3, A-05/E-06) ===
// NO hard-coded link in the source. The 3 links are injected at build time:
//   - deploy-preprod.yml → secrets VITE_STRIPE_LINK_*_PREPROD (TEST-mode links test_…)
//   - deploy.yml (prod)  → secrets VITE_STRIPE_LINK_*         (LIVE links)
// Missing variable → '' → inert checkout button (VISIBLE failure when scanning the console,
// never an implicit live link).
// Runtime guard: a live link is never served outside the production hosts
// → no cs_live reachable from pre-prod/localhost/pages.dev (incident dev-audit-09, 6/07).
// NB: `group` (checkout|billing) kept for signature compatibility — a single
// set of links per environment since the billing Payment Links were disabled
// (5/07); the 14 d trial also applies to upgrades (decision by Lidia 6/07).

const ENV_LINKS = {
  starter: (import.meta.env && import.meta.env.VITE_STRIPE_LINK_STARTER) || '',
  growth: (import.meta.env && import.meta.env.VITE_STRIPE_LINK_GROWTH) || '',
  elite: (import.meta.env && import.meta.env.VITE_STRIPE_LINK_ELITE) || '',
}

const PROD_HOSTS = ['scalyo.app', 'www.scalyo.app', 'app.scalyo.app']
const TEST_LINK_PREFIX = 'https://buy.stripe.com/test_'

// Pure and testable under node: a test link passes everywhere; a live link passes
// only on a production host.
export function isStripeLinkAllowed(url, hostname) {
  if (!url) return false
  if (url.startsWith(TEST_LINK_PREFIX)) return true
  return PROD_HOSTS.includes(hostname)
}

// group: 'checkout' (Landing, Paywall) | 'billing' (Settings) — same set per env.
// The client_reference_id is indispensable: it is the only user-mapping key
// on the Stripe webhook side (stripe-webhook.js).
export function stripeCheckoutUrl(group, plan, { email, userId } = {}) {
  const base = ENV_LINKS[plan] || ''
  const hostname = typeof window !== 'undefined' ? window.location.hostname : ''
  if (!isStripeLinkAllowed(base, hostname)) {
    if (base) console.error('[stripe] live link blocked outside a production host (' + hostname + ')')
    return ''
  }
  const params = []
  if (email) params.push('prefilled_email=' + encodeURIComponent(email))
  if (userId) params.push('client_reference_id=' + userId)
  return params.length ? base + '?' + params.join('&') : base
}

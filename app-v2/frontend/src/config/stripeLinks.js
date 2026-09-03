// === Liens Stripe Payment Links — source unique, injectée par environnement (CR-3, A-05/E-06) ===
// AUCUN lien en dur dans le source. Les 3 liens sont injectés au build :
//   - deploy-preprod.yml → secrets VITE_STRIPE_LINK_*_PREPROD (liens mode TEST test_…)
//   - deploy.yml (prod)  → secrets VITE_STRIPE_LINK_*         (liens LIVE)
// Variable absente → '' → bouton checkout inerte (échec VISIBLE au scan console,
// jamais un lien live implicite).
// Garde runtime : un lien live n'est jamais servi hors des hôtes de production
// → aucun cs_live atteignable depuis préprod/localhost/pages.dev (incident dev-audit-09, 6/07).
// NB : `group` (checkout|billing) conservé pour compatibilité de signature — un seul
// jeu de liens par environnement depuis la désactivation des Payment Links billing
// (5/07) ; l'essai 14 j s'applique aussi aux upgrades (arbitrage Lidia 6/07).

const ENV_LINKS = {
  starter: (import.meta.env && import.meta.env.VITE_STRIPE_LINK_STARTER) || '',
  growth: (import.meta.env && import.meta.env.VITE_STRIPE_LINK_GROWTH) || '',
  elite: (import.meta.env && import.meta.env.VITE_STRIPE_LINK_ELITE) || '',
}

const PROD_HOSTS = ['scalyo.app', 'www.scalyo.app', 'app.scalyo.app']
const TEST_LINK_PREFIX = 'https://buy.stripe.com/test_'

// Pure et testable en node : un lien test passe partout ; un lien live passe
// uniquement sur un hôte de production.
export function isStripeLinkAllowed(url, hostname) {
  if (!url) return false
  if (url.startsWith(TEST_LINK_PREFIX)) return true
  return PROD_HOSTS.includes(hostname)
}

// group : 'checkout' (Landing, Paywall) | 'billing' (Settings) — même jeu par env.
// Le client_reference_id est indispensable : c'est la seule clé de mapping
// utilisateur côté webhook Stripe (stripe-webhook.js).
export function stripeCheckoutUrl(group, plan, { email, userId } = {}) {
  const base = ENV_LINKS[plan] || ''
  const hostname = typeof window !== 'undefined' ? window.location.hostname : ''
  if (!isStripeLinkAllowed(base, hostname)) {
    if (base) console.error('[stripe] lien live bloqué hors hôte de production (' + hostname + ')')
    return ''
  }
  const params = []
  if (email) params.push('prefilled_email=' + encodeURIComponent(email))
  if (userId) params.push('client_reference_id=' + userId)
  return params.length ? base + '?' + params.join('&') : base
}

// PREUVE PAYWALL-MEMBER — R25 §4 (regression avant commit)
//
// Methode : les declarations `const X = computed(...)` sont EXTRAITES LITTERALEMENT
// du fichier src/stores/auth.js (lecture disque, aucune reecriture a la main), puis
// evaluees avec le vrai systeme de reactivite de Vue. Si le code du store change,
// cette preuve change avec lui. Un import direct du module est impossible hors Vite
// (alias @/, import.meta.env, client supabase) — d'ou l'extraction.

import { readFileSync } from 'node:fs'
import { ref, computed } from 'vue'

const SRC = new URL('../src/stores/auth.js', import.meta.url)
const src = readFileSync(SRC, 'utf8')

const NOMS = [
  'hasActiveSubscription', 'trialStartedAt', 'trialUsed', 'trialDaysLeft',
  'orgTrialDaysLeft', 'isOnBetaAccess', 'orgGrantsAccess', 'isOnTrial',
  'trialExpired', 'isAlphaTester', 'needsPayment',
]

// Extraction : une declaration par ligne dans ce fichier (style du store).
const lignes = src.split('\n')
const extraites = []
for (const nom of NOMS) {
  const l = lignes.find(x => x.startsWith(`const ${nom} = computed(`))
  if (!l) { console.error(`ECHEC EXTRACTION : ${nom} introuvable ou multi-lignes`); process.exit(1) }
  extraites.push(l)
}

const TRIAL_DAYS = 14
const JOUR = 86400000

function construire(profilVal, orgVal) {
  const profile = ref(profilVal)
  const org = ref(orgVal)
  const ctx = { ref, computed, profile, org, TRIAL_DAYS }
  const corps = extraites.join('\n') + '\nreturn { ' + NOMS.join(', ') + ' }'
  const f = new Function(...Object.keys(ctx), corps)
  return f(...Object.values(ctx))
}

const hier = new Date(Date.now() - 30 * JOUR).toISOString()
const recent = new Date(Date.now() - 2 * JOUR).toISOString()
const dansUnMois = new Date(Date.now() + 30 * JOUR).toISOString()

const CAS = [
  { nom: '1. Compte SANS org, essai en cours',
    profil: { trial_started_at: recent, trial_used: false }, org: null,
    attendu: { needsPayment: false, isOnTrial: true } },

  { nom: '2. Compte SANS org, essai fini, aucun abonnement',
    profil: { trial_started_at: hier, trial_used: true }, org: null,
    attendu: { needsPayment: true, trialExpired: true } },

  { nom: '3. Owner d une org abonnee (abo aussi sur son profil)',
    profil: { trial_started_at: hier, trial_used: true, stripe_subscription_id: 'sub_owner' },
    org: { stripe_subscription_id: 'sub_org', plan: 'elite' },
    attendu: { needsPayment: false, hasActiveSubscription: true } },

  { nom: '4. MEMBRE d une org abonnee, essai perso consomme  <-- LE BUG',
    profil: { trial_started_at: hier, trial_used: true }, // aucun abo sur le profil
    org: { stripe_subscription_id: 'sub_org', plan: 'elite' },
    attendu: { needsPayment: false, trialExpired: false, hasActiveSubscription: false } },

  { nom: '5. Membre d une org NON payante, essai fini',
    profil: { trial_started_at: hier, trial_used: true }, org: { plan: 'starter' },
    attendu: { needsPayment: true, trialExpired: true } },

  { nom: '6. Membre d une org en ACCES BETA, essai perso consomme',
    profil: { trial_started_at: hier, trial_used: true },
    org: { trial_ends_at: dansUnMois, plan: 'growth' },
    attendu: { needsPayment: false, isOnBetaAccess: true } },

  { nom: '7. Membre d une org dont l acces beta a EXPIRE',
    profil: { trial_started_at: hier, trial_used: true },
    org: { trial_ends_at: hier, plan: 'growth' },
    attendu: { needsPayment: true, isOnBetaAccess: false } },

  { nom: '8. Alpha tester, essai fini, sans org',
    profil: { trial_started_at: hier, trial_used: true, is_alpha_tester: true }, org: null,
    attendu: { needsPayment: false } },
]

let ko = 0
for (const c of CAS) {
  const s = construire(c.profil, c.org)
  const obtenu = {}
  for (const k of Object.keys(c.attendu)) obtenu[k] = s[k].value
  const ok = Object.keys(c.attendu).every(k => obtenu[k] === c.attendu[k])
  if (!ok) ko++
  console.log(`${ok ? 'OK  ' : 'ECHEC'} ${c.nom}`)
  console.log(`      attendu ${JSON.stringify(c.attendu)}`)
  console.log(`      obtenu  ${JSON.stringify(obtenu)}`)
}
console.log(`\n${CAS.length - ko}/${CAS.length} cas verts`)
process.exit(ko ? 1 : 0)

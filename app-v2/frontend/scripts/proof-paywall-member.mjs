// PAYWALL-MEMBER EVIDENCE — R25 §4 (regression check before commit)
//
// Method: the `const X = computed(...)` declarations are extracted LITERALLY
// from src/stores/auth.js (read from disk, nothing rewritten by hand), then
// evaluated with Vue's real reactivity system. If the store's code changes,
// this evidence changes with it. A direct import of the module is impossible outside Vite
// (@/ alias, import.meta.env, supabase client) — hence the extraction.

import { readFileSync } from 'node:fs'
import { ref, computed } from 'vue'

const SRC = new URL('../src/stores/auth.js', import.meta.url)
const src = readFileSync(SRC, 'utf8')

const NAMES = [
  'hasActiveSubscription', 'trialStartedAt', 'trialUsed', 'trialDaysLeft',
  'orgTrialDaysLeft', 'isOnBetaAccess', 'orgGrantsAccess', 'isOnTrial',
  'trialExpired', 'isAlphaTester', 'needsPayment',
]

// Extraction: one declaration per line in this file (the store's style).
const lines = src.split('\n')
const extracted = []
for (const name of NAMES) {
  const l = lines.find(x => x.startsWith(`const ${name} = computed(`))
  if (!l) { console.error(`EXTRACTION FAILED: ${name} not found or spans multiple lines`); process.exit(1) }
  extracted.push(l)
}

const TRIAL_DAYS = 14
const DAY = 86400000

function build(profileVal, orgVal) {
  const profile = ref(profileVal)
  const org = ref(orgVal)
  const ctx = { ref, computed, profile, org, TRIAL_DAYS }
  const body = extracted.join('\n') + '\nreturn { ' + NAMES.join(', ') + ' }'
  const f = new Function(...Object.keys(ctx), body)
  return f(...Object.values(ctx))
}

const longAgo = new Date(Date.now() - 30 * DAY).toISOString()
const recent = new Date(Date.now() - 2 * DAY).toISOString()
const inOneMonth = new Date(Date.now() + 30 * DAY).toISOString()

const CASES = [
  { name: '1. Account WITHOUT an org, trial running',
    profile: { trial_started_at: recent, trial_used: false }, org: null,
    expected: { needsPayment: false, isOnTrial: true } },

  { name: '2. Account WITHOUT an org, trial over, no subscription',
    profile: { trial_started_at: longAgo, trial_used: true }, org: null,
    expected: { needsPayment: true, trialExpired: true } },

  { name: '3. Owner of a subscribed org (subscription on the profile too)',
    profile: { trial_started_at: longAgo, trial_used: true, stripe_subscription_id: 'sub_owner' },
    org: { stripe_subscription_id: 'sub_org', plan: 'elite' },
    expected: { needsPayment: false, hasActiveSubscription: true } },

  { name: '4. MEMBER of a subscribed org, personal trial used up  <-- THE BUG',
    profile: { trial_started_at: longAgo, trial_used: true }, // no subscription on the profile
    org: { stripe_subscription_id: 'sub_org', plan: 'elite' },
    expected: { needsPayment: false, trialExpired: false, hasActiveSubscription: false } },

  { name: '5. Member of a NON-paying org, trial over',
    profile: { trial_started_at: longAgo, trial_used: true }, org: { plan: 'starter' },
    expected: { needsPayment: true, trialExpired: true } },

  { name: '6. Member of an org on BETA ACCESS, personal trial used up',
    profile: { trial_started_at: longAgo, trial_used: true },
    org: { trial_ends_at: inOneMonth, plan: 'growth' },
    expected: { needsPayment: false, isOnBetaAccess: true } },

  { name: '7. Member of an org whose beta access has EXPIRED',
    profile: { trial_started_at: longAgo, trial_used: true },
    org: { trial_ends_at: longAgo, plan: 'growth' },
    expected: { needsPayment: true, isOnBetaAccess: false } },

  { name: '8. Alpha tester, trial over, no org',
    profile: { trial_started_at: longAgo, trial_used: true, is_alpha_tester: true }, org: null,
    expected: { needsPayment: false } },
]

let failed = 0
for (const c of CASES) {
  const s = build(c.profile, c.org)
  const actual = {}
  for (const k of Object.keys(c.expected)) actual[k] = s[k].value
  const ok = Object.keys(c.expected).every(k => actual[k] === c.expected[k])
  if (!ok) failed++
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${c.name}`)
  console.log(`      expected ${JSON.stringify(c.expected)}`)
  console.log(`      actual   ${JSON.stringify(actual)}`)
}
console.log(`\n${CASES.length - failed}/${CASES.length} cases green`)
process.exit(failed ? 1 : 0)

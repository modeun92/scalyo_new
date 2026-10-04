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
  'period', 'hasActiveSubscription', 'trialStartedAt', 'trialUsed', 'trialDaysLeft',
  'orgTrialDaysLeft', 'isOnBetaAccess', 'orgGrantsAccess', 'isOnTrial',
  'trialExpired', 'isAlphaTester', 'needsPayment', 'readOnly',
]

// Extraction: one declaration per line in this file (the store's style).
const lines = src.split('\n')
const extracted = []
for (const name of NAMES) {
  const l = lines.find(x => x.startsWith(`const ${name} = computed(`))
  if (!l) { console.error(`EXTRACTION FAILED: ${name} not found or spans multiple lines`); process.exit(1) }
  extracted.push(l)
}

const DAY_MS = 86400000

// CORE-V2-ME (04/10/2026): the store reads core_v2_me(); a case is the `me` it would receive —
// the organization's current period (subscription), the person's own trial, their role and status.
function build(meVal) {
  const me = ref(meVal)
  const ctx = { ref, computed, me, DAY_MS }
  const body = extracted.join('\n') + '\nreturn { ' + NAMES.join(', ') + ' }'
  const f = new Function(...Object.keys(ctx), body)
  return f(...Object.values(ctx))
}

const iso = (days) => new Date(Date.now() + days * DAY_MS).toISOString()
const ORG = { id: 'org-uuid', core_id: 1, name: 'Acme' }
const trialOver = { started_at: iso(-30), ends_at: iso(-16) }
const trialRunning = { started_at: iso(-2), ends_at: iso(12) }
const period = (kind, type, endInDays) => ({ kind, type, seats: null, issue_date: iso(-1), period_end: endInDays == null ? null : iso(endInDays) })

const CASES = [
  { name: '1. Owner, the organization on its trial',
    me: { organization: ORG, role: 'owner', job_status: 'ACTIVE', trial: trialRunning, subscription: period('TRIAL', 'STARTER', 12) },
    expected: { needsPayment: false, isOnTrial: true, trialDaysLeft: 12 } },

  { name: '2. Owner, trial over, no period',
    me: { organization: ORG, role: 'owner', job_status: 'ACTIVE', trial: trialOver, subscription: null },
    expected: { needsPayment: true, trialExpired: true } },

  { name: '3. Owner of a paying organization',
    me: { organization: ORG, role: 'owner', job_status: 'ACTIVE', trial: trialOver, subscription: period('PAID', 'ELITE', 20) },
    expected: { needsPayment: false, hasActiveSubscription: true } },

  { name: '4. MEMBER of a paying organization, own trial used up  <-- THE BUG',
    me: { organization: ORG, role: 'member', job_status: 'ACTIVE', trial: trialOver, subscription: period('PAID', 'ELITE', 20) },
    expected: { needsPayment: false, trialExpired: false, hasActiveSubscription: false } },

  { name: '5. Member of a NON-paying organization, trial over',
    me: { organization: ORG, role: 'member', job_status: 'ACTIVE', trial: trialOver, subscription: null },
    expected: { needsPayment: true, trialExpired: true } },

  { name: '6. Member of an organization on BETA ACCESS (a promo window), own trial used up',
    me: { organization: ORG, role: 'member', job_status: 'ACTIVE', trial: trialOver, subscription: period('PROMO', 'GROWTH', 30) },
    expected: { needsPayment: false, isOnBetaAccess: true } },

  { name: '7. Member of an organization whose beta access has EXPIRED (no period left)',
    me: { organization: ORG, role: 'member', job_status: 'ACTIVE', trial: trialOver, subscription: null },
    expected: { needsPayment: true, isOnBetaAccess: false } },

  { name: '8. Alpha tester: a promo period with no end',
    me: { organization: ORG, role: 'owner', job_status: 'ACTIVE', trial: null, subscription: period('PROMO', 'ELITE', null) },
    expected: { needsPayment: false, isAlphaTester: true, isOnBetaAccess: false } },

  { name: '9. Own trial running, but the organization has no period (decided 04/10/2026: the org grants access)',
    me: { organization: ORG, role: 'member', job_status: 'ACTIVE', trial: trialRunning, subscription: null },
    expected: { needsPayment: true, orgGrantsAccess: false } },

  { name: '10. core_v2_me not answered yet: no verdict',
    me: null,
    expected: { needsPayment: false, trialExpired: false } },

  { name: '11. INACTIVE worker of a paying organization: read-only, not the paywall',
    me: { organization: ORG, role: 'member', job_status: 'INACTIVE', read_only: true, trial: null, subscription: period('PAID', 'ELITE', 20) },
    expected: { needsPayment: false, readOnly: true } },
]

let failed = 0
for (const c of CASES) {
  const s = build(c.me)
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

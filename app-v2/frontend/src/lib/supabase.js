import { createClient } from '@supabase/supabase-js'

// REALTIME-ENVKEY (16/07/2026): a trailing newline in a build secret passed
// straight into the bundle -> apikey+%0A in the WSS query string -> silent close 1006
// upstream of the tenant (HTTP headers are normalized by the browser,
// so REST/auth stayed intact). .trim() immunizes every build, dirty secret or not.
const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL || '').trim()
const supabaseAnonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY || '').trim()

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase env variables: VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are required')
}

// R22 v2 (root fix for G9-13, 15/07/2026): NO `lock` option at all.
// The lockless default of auth-js >= 2.10x (single-flight refresh + commit guard)
// is the supported route — Navigator Locks is NOT reintroduced, the default no
// longer uses it. NEVER pass a custom lock again, not even a no-op: any non-null
// lock re-activates the legacy _acquireLock/pendingInLock queue, which
// deadlocks when an onAuthStateChange callback makes a Supabase call during
// TOKEN_REFRESHED (cycle refresh → notify → subscriber → getSession → refresh
// queue = the G9-13 freeze, per-tab and total, only repaired by a reload).
// Before/after evidence: layer-α repro script (contract G9-13, 15/07).
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
})

// ── G9-13 instrumentation ──────────────────────────────────────────────
// Timestamped log of every auth state change (esp. TOKEN_REFRESHED). Kept
// post-fix to verify in real conditions that the wedge is gone (strate β).
// Callback deliberately SYNCHRONOUS — never an awaited Supabase call here.
supabase.auth.onAuthStateChange((event, session) => {
  const exp = session && session.expires_at ? new Date(session.expires_at * 1000).toISOString() : 'n/a'
  console.info('[auth]', new Date().toISOString(), event, 'token_exp=' + exp)
})

// ── JOB-STATUS-READ (04/10/2026): the read-only account ────────────────────
// An INACTIVE or ON_LEAVE worker sees the product but changes nothing (decided 04/10/2026). Every
// write leaves the browser through this client, so it is refused HERE, once, rather than in each of
// the ~25 stores that write: an insert / update / upsert / delete, or an RPC that is not on the
// read list below, answers { data: null, error: { code: 'read_only' } } without a request — and the
// callers already treat an error as a failure (D-14), so nothing shows a false success. The screen
// greys itself and disables its inputs (AppLayout); this is what holds when a button is still
// clickable. The database refuses on its own too: no core_v2 write accepts anything but ACTIVE.
// auth.fetchProfile sets the flag from core_v2_me().read_only.
let readOnlyWrites = false
export function setReadOnlyWrites(on) { readOnlyWrites = !!on }
export function isReadOnlyWrites() { return readOnlyWrites }
// RPCs that only read: everything else is a write for this purpose.
const READ_RPCS = new Set([
  'core_v2_me', 'core_v2_my_team', 'core_v2_my_profile', 'core_v2_my_subscription',
  'get_org_member_names', 'get_org_email_status', 'oxygen_team_aggregate',
])
const READ_ONLY_ERROR = { message: 'READ_ONLY', code: 'read_only' }
// A refused write must still accept the rest of its chain (.eq().select().single()) and be awaited.
function refusedWrite() {
  const result = { data: null, error: READ_ONLY_ERROR, count: null, status: 403, statusText: 'read_only' }
  const chain = new Proxy(function () {}, {
    get(_, prop) {
      if (prop === 'then') return (resolve) => resolve(result)
      return () => chain
    },
    apply() { return chain },
  })
  return chain
}
const rawFrom = supabase.from.bind(supabase)
supabase.from = (table) => {
  const builder = rawFrom(table)
  if (!readOnlyWrites) return builder
  for (const m of ['insert', 'update', 'upsert', 'delete']) builder[m] = () => refusedWrite()
  return builder
}
const rawRpc = supabase.rpc.bind(supabase)
supabase.rpc = (fn, ...rest) => (readOnlyWrites && !READ_RPCS.has(fn)) ? refusedWrite() : rawRpc(fn, ...rest)

// IDLE-5H (07/09/2026): "is there a persisted session at all?", asked without touching
// GoTrue. getSession() would answer it too, but it also REFRESHES the token as a side
// effect — useless before we have decided whether to keep the session, and the reason the
// router guard has always sniffed the keys directly. One copy, so the prefix is written once.
export function hasStoredSession() {
  try { return Object.keys(localStorage).some(k => k.startsWith('sb-')) } catch (_) { return false }
}

export { supabaseUrl, supabaseAnonKey }

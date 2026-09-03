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

export { supabaseUrl, supabaseAnonKey }

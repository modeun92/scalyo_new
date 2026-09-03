import { createClient } from '@supabase/supabase-js'

// REALTIME-ENVKEY (16/07/2026) : un \n final dans un secret de build passait
// tel quel dans le bundle -> apikey+%0A en query string WSS -> close 1006
// silencieux en amont du tenant (headers HTTP normalises par le navigateur,
// donc REST/auth intacts). .trim() immunise tous les builds, secret sale ou non.
const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL || '').trim()
const supabaseAnonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY || '').trim()

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase env variables: VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are required')
}

// R22 v2 (fix racine G9-13, 15/07/2026) : AUCUNE option `lock`.
// Le défaut lockless d'auth-js ≥ 2.10x (refresh single-flight + commit guard)
// est la voie supportée — Navigator Locks n'est PAS réintroduit, le défaut ne
// l'utilise plus. Ne JAMAIS repasser un lock custom, même no-op : tout lock
// non-null ré-active la file legacy _acquireLock/pendingInLock, qui se
// deadlocke quand un callback onAuthStateChange fait un appel Supabase pendant
// TOKEN_REFRESHED (cycle refresh → notify → subscriber → getSession → file du
// refresh = gel G9-13, per-onglet et total, réparé seulement par reload).
// Preuve avant/après : script repro strate α (contrat G9-13, 15/07).
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
// Callback volontairement SYNCHRONE — jamais d'appel Supabase awaité ici.
supabase.auth.onAuthStateChange((event, session) => {
  const exp = session && session.expires_at ? new Date(session.expires_at * 1000).toISOString() : 'n/a'
  console.info('[auth]', new Date().toISOString(), event, 'token_exp=' + exp)
})

export { supabaseUrl, supabaseAnonKey }

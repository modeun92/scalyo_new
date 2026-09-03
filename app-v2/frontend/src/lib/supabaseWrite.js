// withWrite() — UX guardrail for the G9-13 silent write freeze (chantier G9-13).
//
// Symptom: ~30-40 min after login, Supabase writes can hang forever with no network
// request and no error (suspected autoRefreshToken + noLock refresh deadlock). Reads
// (open realtime) keep working; a full reload repairs. Because writes are `await`ed
// with only console.error on failure, the freeze is INVISIBLE to the user.
//
// withWrite() makes it VISIBLE and safe:
//   - bounds every write with a timeout (so the promise can't hang the caller),
//   - on timeout, shows a persistent, actionable toast (reload repairs),
//   - nudges the auth client (read-only getSession) so later writes may recover,
//   - does NOT auto-retry the write (a hung insert that silently fired would double-apply).
//
// Usage: const { data, error } = await withWrite(() => supabase.from('t').insert(x))
// The { data, error } shape is preserved so existing callers keep working.

import { supabase } from '@/lib/supabase'
import { showToast } from '@/lib/toast'
import { i18n } from '@/i18n'

const WRITE_TIMEOUT_MS = 8000

function timeoutBox(ms) {
  return new Promise((resolve) =>
    setTimeout(() => resolve({ data: null, error: { message: 'WRITE_TIMEOUT', __timeout: true } }), ms)
  )
}

export async function withWrite(factory, { label = '' } = {}) {
  let res
  try {
    res = await Promise.race([Promise.resolve().then(factory), timeoutBox(WRITE_TIMEOUT_MS)])
  } catch (e) {
    res = { data: null, error: e }
  }

  if (res && res.error && res.error.__timeout) {
    // Read-only nudge — may unstick subsequent writes. Never awaited on the hot path.
    try { supabase.auth.getSession().catch(() => {}) } catch (_) { /* noop */ }
    showToast(i18n.global.t('write_frozen_reload'), 'error', 0) // persistent
    console.error('[withWrite] FROZEN (G9-13):', label || '(unlabeled write)')
  } else if (res && res.error) {
    showToast(i18n.global.t('write_failed'), 'error', 6000)
    console.error('[withWrite] error:', label, res.error.message || res.error)
  }
  return res
}

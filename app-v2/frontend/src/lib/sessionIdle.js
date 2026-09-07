// IDLE-5H (07/09/2026): the login session ends 5 hours after the LAST INTERACTION,
// not 5 hours after login. Supabase is deliberately given no say here: the client is
// built with `autoRefreshToken: true` and `persistSession: true` (lib/supabase.js), so
// GoTrue rotates the access token forever in the background and the session in
// localStorage survives tab close, browser restart and reboot — there was no upper bound
// on an abandoned session at all. This module is that bound.
//
// Client-side enforcement is a USE boundary, not a security one: the refresh token stays
// valid at Supabase until its own expiry, so this must be paired with the project's
// Auth > Sessions > "Inactivity timeout" = 5 h. Removing one without the other silently
// halves the guarantee — the app would stop asking, or the server would cut a session the
// app still believes is live.

export const IDLE_TIMEOUT_MS = 5 * 60 * 60 * 1000

// Separate from `scalyo_locale` / `scalyo_theme` and NOT under the `sb-` prefix: the auth
// store's clearSupabaseStorage() wipes every `sb-*` key before each login attempt, and a
// stamp caught in that wipe would read as "never active" one line before we seed it.
const ACTIVITY_KEY = 'scalyo_last_activity'

// A stamp is rewritten at most once a minute. Writing on every scroll/keystroke put a
// synchronous localStorage write in the middle of typing and of every scroll frame; 60 s
// of drift is nothing against a 5 h window.
const WRITE_THROTTLE_MS = 60 * 1000

// The sweep only has to catch the boundary, and a tab returning from the background is
// checked immediately on visibilitychange regardless of where the interval sits.
const SWEEP_INTERVAL_MS = 60 * 1000

// Interaction, not presence: a mouse jiggling on an unattended desk is not a user. Scroll
// and wheel ARE interaction — reading a long portfolio without clicking must not expire.
const ACTIVITY_EVENTS = ['pointerdown', 'keydown', 'scroll', 'wheel', 'touchstart']

let lastWrite = 0

export function readLastActivity() {
  try {
    const raw = localStorage.getItem(ACTIVITY_KEY)
    if (!raw) return null
    const ts = Number(raw)
    // R21: a corrupt stamp is absent, never a plausible "now" — see isIdleExpired.
    return Number.isFinite(ts) && ts > 0 ? ts : null
  } catch (_) { return null }
}

// `force` bypasses the throttle — used when seeding a brand new session at login, where
// the stamp MUST land even if something touched the clock a moment earlier.
export function touchActivity(force = false) {
  const now = Date.now()
  if (!force && now - lastWrite < WRITE_THROTTLE_MS) return
  lastWrite = now
  try { localStorage.setItem(ACTIVITY_KEY, String(now)) } catch (_) { /* private mode: the sweep then fails closed, which is the safe side */ }
}

export function clearActivity() {
  lastWrite = 0
  try { localStorage.removeItem(ACTIVITY_KEY) } catch (_) {}
}

// FAIL-CLOSED: no stamp = expired, never "assume fresh". A missing stamp means we cannot
// prove when the session was last used, and the whole point of this module is bounding
// that. Consequence, accepted: the deploy that introduces this key logs every currently
// open session out once, because none of them carry a stamp yet.
export function isIdleExpired(now = Date.now()) {
  const last = readLastActivity()
  if (last === null) return true
  // A stamp in the future (clock moved backwards, or another machine's stamp restored
  // with the profile) is not a licence for 5 more hours — treat it as now.
  if (last > now) return false
  return now - last >= IDLE_TIMEOUT_MS
}

// Starts the listeners and the sweep. `onExpire` is called AT MOST ONCE per watch: the
// caller tears the session down and navigates, and a second call landing mid-logout raced
// its own redirect. Returns the stop function.
//
// `isSessionActive` is NOT optional and NOT a convenience — both halves of the watch are
// wrong without it, because isIdleExpired() fails closed on a missing stamp:
//   · the sweep would fire on an anonymous visitor reading the landing page (no stamp =
//     expired) and throw them onto /login?expired=1 having never had a session;
//   · the listeners would stamp that same anonymous scrolling, and a six-hour-stale
//     session sitting in storage would be silently REVIVED by a scroll on the public
//     landing page — the exact hole this module exists to close.
export function startIdleWatch(onExpire, isSessionActive) {
  let stopped = false
  let fired = false

  const active = () => { try { return !!isSessionActive() } catch (_) { return false } }

  const check = () => {
    if (stopped || fired || !active()) return
    if (!isIdleExpired()) return
    fired = true
    stop()
    try { onExpire() } catch (e) { console.error('[idle] onExpire failed:', e?.message || e) }
  }

  const onActivity = () => {
    if (stopped || fired || !active()) return
    touchActivity()
  }

  const onVisibility = () => {
    if (document.visibilityState !== 'visible') return
    // Check BEFORE touching: a tab restored after six hours is expired, and counting its
    // own return as the interaction that saves it would make the timeout unreachable for
    // anyone who leaves tabs open.
    check()
    onActivity()
  }

  // Capture + passive: some views stop propagation on their own scroll containers, and a
  // listener that never sees those events would expire a user who is actively reading.
  ACTIVITY_EVENTS.forEach(evt => window.addEventListener(evt, onActivity, { capture: true, passive: true }))
  document.addEventListener('visibilitychange', onVisibility)
  const timer = setInterval(check, SWEEP_INTERVAL_MS)

  function stop() {
    if (stopped) return
    stopped = true
    clearInterval(timer)
    ACTIVITY_EVENTS.forEach(evt => window.removeEventListener(evt, onActivity, { capture: true }))
    document.removeEventListener('visibilitychange', onVisibility)
  }

  return stop
}

import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { supabase, hasStoredSession, setReadOnlyWrites } from '@/lib/supabase'
import { isIdleExpired, touchActivity, clearActivity } from '@/lib/sessionIdle'
import { baseLanguage, isSupportedRegion, resolveLocale, BASE_REGION } from '@/i18n/regional'
async function loadAllStores() {
try {
const { useClientStore } = await import('@/stores/clients')
const { useTeamStore } = await import('@/stores/team')
const { useTaskStore } = await import('@/stores/tasks')
const { useKpiStore } = await import('@/stores/kpis')
const { useNotificationStore } = await import('@/stores/notifications')
const { usePlaybookStore } = await import('@/stores/playbooks')
const { useRoadmapStore } = await import('@/stores/roadmap')
const { useSnapshotStore } = await import('@/stores/snapshots')
await Promise.all([useClientStore().loadClients(), useTeamStore().loadMembers(), useTaskStore().loadTasks(), useKpiStore().loadCopils(), useNotificationStore().loadNotifications(), usePlaybookStore().loadPlaybooks(), useRoadmapStore().loadRoadmaps(), useSnapshotStore().loadSnapshots()])
} catch(e) { console.error('loadAllStores error:', e) }
}
async function clearAllStoreData() {
try {
const { useClientStore } = await import('@/stores/clients')
const { useTeamStore } = await import('@/stores/team')
const { useTaskStore } = await import('@/stores/tasks')
useClientStore().clients.length = 0
useTeamStore().members.length = 0
const ts = useTaskStore(); ts.clear()
} catch(e) {}
}
function clearSupabaseStorage() {
try { Object.keys(localStorage).filter(k => k.startsWith('sb-')).forEach(k => localStorage.removeItem(k)) } catch (_) {}
}
async function resetGoTrueClient() {
try { await Promise.race([supabase.auth.signOut({ scope: 'local' }), new Promise(r => setTimeout(r, 2000))]) } catch (_) {}
}
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
const DAY_MS = 86400000
// CORE-V2-ME (04/10/2026): the signed-in person is read from core_v2 in ONE call, core_v2_me()
// (20261004100000) — profiles and organizations are on their way out (stage 2 of retiring the old core
// tables). `profile` and `org` keep the shape the screens already read (profile.first_name,
// profile.organization_id = the OLD organization uuid the kept tables still hold, …), built from it in
// fetchProfile, so no screen had to change. Access is the ORGANIZATION's current subscription period
// (decided 04/10/2026): a person's own trial no longer opens an organization that has no period.
export const useAuthStore = defineStore('auth', () => {
const user = ref(null)
const session = ref(null)
const me = ref(null)
const profile = ref(null)
const org = ref(null)
const orgRole = ref(null)
const loading = ref(false)
const error = ref(null)
const isAuthenticated = computed(() => !!user.value)
const fullName = computed(() => { if (!profile.value) return ''; return (profile.value.first_name + ' ' + profile.value.last_name).trim() })
const greeting = computed(() => { const h = new Date().getHours(); if (h < 12) return 'morning'; if (h < 18) return 'afternoon'; return 'evening' })
// The organization's current period (TRIAL / PROMO / PAID / CONTRACT), or null: no access.
const period = computed(() => me.value?.subscription || null)
// PAYWALL-MEMBER: the PERSONAL subscription status (SettingsBilling, PaymentSuccessView) — the billing
// owner of a paid period. A member does not manage the organization's subscription; widening this
// would show them a management block that is not theirs.
const hasActiveSubscription = computed(() => period.value?.kind === 'PAID' && me.value?.role === 'owner')
const trialStartedAt = computed(() => { const d = me.value?.trial?.started_at; return d ? new Date(d) : null })
// The person's own trial is over (14 days elapsed, or cut by a checkout): one trial per person.
const trialUsed = computed(() => { const e = me.value?.trial?.ends_at; return !!e && new Date(e).getTime() <= Date.now() })
const trialDaysLeft = computed(() => { if (period.value?.kind !== 'TRIAL' || !period.value.period_end) return 0; return Math.max(0, Math.ceil((new Date(period.value.period_end).getTime() - Date.now()) / DAY_MS)) })
// D1: promo / beta access = a PROMO period of the ORGANIZATION that has an end. An alpha tester's has
// none (ALPHA-FOREVER): no countdown banner for it.
const orgTrialDaysLeft = computed(() => { if (period.value?.kind !== 'PROMO' || !period.value.period_end) return 0; return Math.max(0, Math.ceil((new Date(period.value.period_end).getTime() - Date.now()) / DAY_MS)) })
const isOnBetaAccess = computed(() => period.value?.kind === 'PROMO' && !!period.value.period_end && orgTrialDaysLeft.value > 0)
// PAYWALL-MEMBER (04/08/2026): access is the ORGANIZATION's — any current period covers every member.
const orgGrantsAccess = computed(() => !!period.value)
const isOnTrial = computed(() => period.value?.kind === 'TRIAL')
const trialExpired = computed(() => !!me.value && !orgGrantsAccess.value && trialUsed.value)
const isAlphaTester = computed(() => period.value?.kind === 'PROMO' && period.value.period_end == null)
// No current period = the paywall. Not before core_v2_me has answered (a null `me` is "still loading",
// and sending everyone to the paywall on the first render would be a false verdict), nor for an
// account in no organization at all.
const needsPayment = computed(() => !!me.value?.organization && !orgGrantsAccess.value)
// JOB-STATUS-READ (04/10/2026): an INACTIVE or ON_LEAVE worker sees the product read-only.
const readOnly = computed(() => me.value?.read_only === true)
const currentPlan = computed(() => period.value?.type ? String(period.value.type).toLowerCase() : null)
// D6 (A-02/E-03): plan label for the UI — never empty
const currentPlanLabel = computed(() => { const p = currentPlan.value; if (!p) return 'Starter'; return p.charAt(0).toUpperCase() + p.slice(1) })
// V1 gating: effective plan is never null → starter (the most restrictive). Avoids getMaxClients(null)=0, which would block any creation.
const effectivePlan = computed(() => currentPlan.value || 'starter')
const userLocale = computed(() => profile.value?.locale || localStorage.getItem('scalyo_locale') || 'fr')
// REGIONAL-I18N (04/09): the account's COUNTRY of expression — the second half of the locale.
// Deliberately NOT profiles.country (which is the company's legal country, read by the quote /
// country-law code): a team can be registered in France and want Québec wording, and a manager
// changing how the interface reads must not silently move the company's legal jurisdiction.
// Falls back to the base region of the language, so an account that never opened the picker keeps
// exactly the wording it had before this column existed.
const userRegion = computed(() => {
  const stored = profile.value?.region || (() => { try { return localStorage.getItem('scalyo_region') } catch (_) { return null } })()
  const code = String(stored || '').trim().toUpperCase()
  return isSupportedRegion(userLocale.value, code) ? code : BASE_REGION[baseLanguage(userLocale.value)]
})
// The locale id the interface actually runs in: language + country resolved once (App.vue applies
// it, formatters.localeTag() formats with it).
const userAppLocale = computed(() => resolveLocale(userLocale.value, userRegion.value))
// SEATS-MISMATCH (25/08): paid seats = the current period's (the Stripe quantity on a PAID one).
// NULL when the period carries none — the tier's ceiling applies (R21: no invented 1).
const seatsPaid = computed(() => period.value?.seats ?? null)
const onboardingCompleted = computed(() => profile.value?.onboarding_completed === true)
const isOrgOwner = computed(() => orgRole.value === 'owner')
// The company is the organization (profiles.company_name -> the organization's name, decided 27/09/2026);
// its legal country is company.country_code, NULL until someone sets it — 'FR' is the quote module's
// default, as it was for profiles.country.
const company = computed(() => {
  if (!profile.value) return null
  return {
    name: org.value?.name || '',
    planLabel: currentPlan.value ? currentPlan.value.charAt(0).toUpperCase() + currentPlan.value.slice(1) : 'Starter',
    country: org.value?.country_code || 'FR',
    }
})
const displayName = computed(() => fullName.value)
const roleLabel = computed(() => {
  const map = { owner: 'Owner', admin: 'Admin', member: 'Member', viewer: 'Viewer' }
  return map[orgRole.value] || 'User'
  })
function clearAllStores() {
const keys = ['scalyo_clients','scalyo_tasks','scalyo_team','scalyo_projects','scalyo_kpis','scalyo_playbooks','scalyo_snapshots','scalyo_okrs','scalyo_roadmap','scalyo_quotes','scalyo_dashboard_kpis']
keys.forEach(k => localStorage.removeItem(k))
}
// STAGE2-WRITES (04/10/2026): the trial is the organization's TRIAL period, opened by core_v2_start_trial
// (20261004120000) — by its OWNER, once per person, and only when the organization has no period: an
// alpha tester (PROMO) and a member of a paying organization need none (D3), a second trial is never
// given, and a member's own trial no longer opens somebody else's company (decided 04/10/2026).
async function ensureTrial(userId) {
if (!me.value?.organization || period.value || me.value?.trial || readOnly.value || me.value?.role !== 'owner') return
try {
const { data, error: err } = await supabase.rpc('core_v2_start_trial')
if (err) { console.error('ensureTrial failed:', err.message); return }
if (data?.ok !== true) { console.warn('ensureTrial refused:', data?.code); return }
await fetchProfile(userId)
} catch (e) { console.error('ensureTrial error:', e.message || e) }
}
async function init() {
loading.value = true
error.value = null
try {
// IDLE-5H (07/09/2026): the idle verdict is read BEFORE getSession(), never after.
// getSession() refreshes an expired access token as a side effect, so checking
// afterwards hands a five-hour-abandoned session a brand new token and only then
// throws it away — the pointless refresh shows up in the auth log and, worse, is
// enough to make the session look alive to a second tab reading the same storage.
if (hasStoredSession() && isIdleExpired()) {
console.info('[idle] session expired (>5h without interaction) — signing out')
clearActivity()
clearSupabaseStorage()
await resetGoTrueClient()
user.value = null; me.value = null; profile.value = null; org.value = null; session.value = null; setReadOnlyWrites(false)
} else {
const sessionResult = await Promise.race([
supabase.auth.getSession(),
new Promise((_, reject) => setTimeout(() => reject(new Error('Session retrieval timeout (10s)')), 10000))
])
const { data, error: sessionError } = sessionResult
if (sessionError) { console.error('Auth init session error:', sessionError.message); error.value = sessionError.message; return }
const sess = data?.session
if (sess && sess.user) {
user.value = sess.user
session.value = sess
await fetchProfile(sess.user.id)
// A session opened by the e-mail confirmation link never goes through login(): its trial starts here.
await ensureTrial(sess.user.id)
// Lot 6 / INV-CONFIRM-TOKEN: a session can open WITHOUT going through login() —
// that is the case for Supabase's "Confirm email address" link, which logs the user
// in directly. acceptPendingInvite was only wired to login() L230: an
// invitee who signed up then confirmed their email landed in an empty org,
// even though the join_confirm_email screen promised automatic activation.
// Placed HERE and not in the onAuthStateChange callback: G9-13 / R22 forbid
// any awaited call inside that callback (GoTrue deadlock). acceptPendingInvite only
// issues fetch() calls to /api, returns immediately when no token is
// pending (zero cost on a nominal boot), and checks the targeted email before replaying.
try { await acceptPendingInvite(sess.access_token) } catch (e) { console.error('init — acceptPendingInvite:', e?.message || e) }
await loadAllStores()
}
}
} catch (e) {
console.error('Auth init timeout/failure:', e.message || e)
error.value = typeof e === 'object' && e.message ? e.message : String(e)
clearSupabaseStorage()
await resetGoTrueClient()
} finally {
loading.value = false
}
// G9-13: SYNCHRONOUS callback — never await a Supabase call inside an
// onAuthStateChange callback (official docs). The client waits for callbacks during a
// refresh (_notifyAllSubscribers): a Supabase call here re-enters the client
// and formed the freeze cycle. fetchProfile is deferred outside the notification
// cycle (setTimeout 0), fire-and-forget, errors logged.
supabase.auth.onAuthStateChange((_event, sess) => {
if (sess && sess.user) {
user.value = sess.user
session.value = sess
setTimeout(() => { fetchProfile(sess.user.id).catch((e) => console.error('Auth state change error:', e?.message || e)) }, 0)
}
else { user.value = null; me.value = null; profile.value = null; org.value = null; session.value = null; setReadOnlyWrites(false) }
})
}
// CORE-V2-ME: one read. `profile` / `org` are the shapes the screens read; `me` is the source.
async function fetchProfile(userId) {
try {
const { data, error: err } = await supabase.rpc('core_v2_me')
if (err) { console.error('fetchProfile (core_v2_me) failed:', err.message); return }
if (!data) return
me.value = data
const o = data.organization || null
const paid = data.subscription?.kind === 'PAID'
org.value = o ? { id: o.id, core_id: o.core_id, name: o.name || '', country_code: o.country_code || null, currency_code: o.currency_code || null } : null
profile.value = {
  id: data.user_id || userId,
  first_name: data.first_name || '',
  last_name: data.last_name || '',
  email: data.email || null,
  locale: data.locale || null,
  region: data.region || null,
  organization_id: o?.id || null,
  org_role: data.role || null,
  job_status: data.job_status || null,
  onboarding_completed: data.tour_completed === true,
  company_name: o?.name || '',
  country: o?.country_code || null,
  subscription_end_date: paid ? data.subscription.period_end : null,
}
orgRole.value = data.role || 'member'
setReadOnlyWrites(data.read_only === true)
} catch (e) { console.error('fetchProfile error:', e.message || e) }
}
const PENDING_INVITE_KEY = 'scalyo_pending_invite'
// Lot 6 — result of the last deferred acceptance attempt, so the
// interface DISPLAYS it instead of swallowing it (INVITATIONS contract §4d).
const pendingInviteResult = ref(null)
function clearPendingInviteResult() { pendingInviteResult.value = null }
function dropPendingInvite() { try { localStorage.removeItem(PENDING_INVITE_KEY) } catch (_) {} }
async function acceptPendingInvite(accessToken) {
let token = null
try { token = localStorage.getItem(PENDING_INVITE_KEY) } catch (_) {}
if (!token || !accessToken) return
// Lot 6 / INVITE-ANY-USER: we only replay the token IF the invitation actually
// targets the account that just logged in. Without this check, a token left
// in the browser by a failed sign-up silently switched the next user's
// organization, with no screen and no confirmation.
try {
const v = await fetch('/api/invite/verify?token=' + encodeURIComponent(token))
const info = await v.json().catch(() => null)
const invited = String((info && info.email) || '').trim().toLowerCase()
const current = String((user.value && user.value.email) || '').trim().toLowerCase()
if (!v.ok || !info || !info.valid) { dropPendingInvite(); return }
if (!invited || !current || invited !== current) {
dropPendingInvite()
pendingInviteResult.value = { ok: false, code: 'email_mismatch', invited_email: info.email || null, current_email: (user.value && user.value.email) || null }
return
}
} catch (_) { return } // network error: token kept for a later retry
try {
const res = await fetch('/api/invite/accept', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + accessToken }, body: JSON.stringify({ token }) })
const data = await res.json().catch(() => null)
if (res.ok) {
dropPendingInvite()
pendingInviteResult.value = { ok: true, already_member: !!(data && data.already_member) }
if (user.value) await fetchProfile(user.value.id)
} else if ([400, 401, 403, 404, 409, 410].includes(res.status)) {
if (res.status !== 401) dropPendingInvite()
pendingInviteResult.value = Object.assign({ ok: false, code: (data && data.code) || 'join_error' }, data || {})
}
} catch (_) { /* network error: token kept for a retry at the next login (CR-1 contract §5) */ }
}
async function login(email, password) {
loading.value = true
error.value = null
clearSupabaseStorage()
await resetGoTrueClient()
try {
const signInResult = await Promise.race([
supabase.auth.signInWithPassword({ email, password }),
new Promise((_, reject) => setTimeout(() => reject(new Error('login_timeout')), 15000))
])
const { data, error: err } = signInResult
if (err) { error.value = err.message; return { success: false, error: err.message } }
clearAllStores()
// IDLE-5H: seed the clock as soon as the session is real, and FORCE past the write
// throttle — a stamp written on the login page a few seconds earlier would otherwise
// swallow this one, and the new session would inherit the previous user's idle age.
touchActivity(true)
user.value = data.user
session.value = data.session || null
await fetchProfile(data.user.id)
await acceptPendingInvite(data.session?.access_token)
await ensureTrial(data.user.id)
await loadAllStores()
return { success: true }
} catch (e) {
console.error('login failure:', e.message || e)
error.value = typeof e === 'object' && e.message ? e.message : String(e)
if (e.message === 'login_timeout') { clearSupabaseStorage(); await resetGoTrueClient() }
return { success: false, error: error.value }
} finally { loading.value = false }
}
async function register(email, password, firstName, lastName, locale = 'fr', promoCode = null) {
loading.value = true
error.value = null
try {
// PROMO-AT-SIGNUP (27/09/2026): the alpha code travels in the signup metadata and the database
// applies it to the account's own organization in the same transaction (20260927130000). It used
// to be sent afterwards to /api/alpha/activate with a user id the endpoint believed blindly — and
// with e-mail confirmation on there is no session yet to prove who is asking.
const meta = { first_name: firstName, last_name: lastName, locale }
if (promoCode && String(promoCode).trim()) meta.promo_code = String(promoCode).trim()
const { data, error: err } = await supabase.auth.signUp({ email, password, options: { data: meta, emailRedirectTo: `${window.location.origin}/login?verified=true` } })
if (err) { error.value = err.message; return { success: false, error: err.message } }
if (data.user) { fetch(SUPABASE_URL + '/functions/v1/send-welcome-email', { method: 'POST', headers: { 'Content-Type': 'application/json', 'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY }, body: JSON.stringify({ email, firstName, lastName }) }).catch(() => {}) }
return { success: true, needsConfirmation: !data.session, user: data.user }
} catch (e) { error.value = typeof e === 'object' && e.message ? e.message : String(e); return { success: false, error: error.value } }
finally { loading.value = false }
}
// STAGE2-WRITES (04/10/2026): language and region are ONE core_v2 value ('fr-CA'), written together by
// core_v2_set_my_language. A region the new language has no variant for is dropped, not kept to be
// ignored at every read.
async function saveLanguage(locale, region) {
const { data, error: err } = await supabase.rpc('core_v2_set_my_language', { p_locale: locale, p_region: region || null })
if (err) return { error: err.message }
if (data?.ok !== true) return { error: data?.code || 'save_failed' }
const next = { locale: data.locale, region: data.region || null }
if (profile.value) profile.value = { ...profile.value, ...next }
if (me.value) me.value = { ...me.value, ...next }
return { success: true }
}
async function saveLocale(locale) {
if (!user.value) return { error: 'no_user' }
try {
const keep = isSupportedRegion(locale, userRegion.value) ? userRegion.value : null
const res = await saveLanguage(locale, keep)
if (res.error) { console.error('saveLocale — update failed:', res.error); return res }
// Public-page consistency (landing/login): same language as the app
try { localStorage.setItem('scalyo_locale', locale) } catch (_) {}
return { success: true }
} catch (e) { console.error('saveLocale — unexpected failure:', e.message || e); return { error: e.message || String(e) } }
}
// REGIONAL-I18N (04/09): the country half of the locale, same write contract as saveLocale
// ({success}/{error}, D-14/D-15 — the picker only shows a ✓ after a confirmed write and reverts
// otherwise). Validated against the picker list for the CURRENT language before the write: a
// country the language has no option for (region 'CA' under Korean) would be stored, then ignored
// by userRegion at every read — a setting that says one thing and does nothing.
async function saveRegion(region) {
if (!user.value) return { error: 'no_user' }
const next = String(region || '').trim().toUpperCase()
if (!isSupportedRegion(userLocale.value, next)) return { error: 'unsupported_region' }
try {
const res = await saveLanguage(userLocale.value, next)
if (res.error) { console.error('saveRegion — update failed:', res.error); return res }
// Read back before the profile loads (i18n/index.js boot) — same role as scalyo_locale, and a
// SEPARATE key on purpose: scalyo_locale must keep holding the bare language for the public
// pages that index a { fr, en, ko } table with it.
try { localStorage.setItem('scalyo_region', next) } catch (_) {}
return { success: true }
} catch (e) { console.error('saveRegion — unexpected failure:', e.message || e); return { error: e.message || String(e) } }
}

// E-04: real profile save — same return contract as saveLocale ({success}/{error})
// CORE-V2-ME: the company name is the ORGANIZATION's name (decided 27/09/2026), so only its owner
// renames it — the same rule as OnboardingView (G9-5); for anyone else the field is read-only and a value
// passed here is ignored. STAGE2-WRITES (04/10/2026): both go through core_v2 (core_v2_set_my_name,
// core_v2_rename_organization), never straight to profiles / organizations.
async function saveProfile(fields) {
if (!user.value) return { error: 'no_user' }
const payload = {
first_name: (fields.first_name || '').trim(),
last_name: (fields.last_name || '').trim(),
}
const companyName = (fields.company_name || '').trim()
const renameOrg = isOrgOwner.value && !!org.value?.id && companyName !== (org.value?.name || '')
try {
const { data, error: err } = await supabase.rpc('core_v2_set_my_name', { p_first: payload.first_name, p_last: payload.last_name })
if (err || data?.ok !== true) { const e = err?.message || data?.code || 'save_failed'; console.error('saveProfile — update failed:', e); return { error: e } }
if (renameOrg) {
const { data: od, error: orgErr } = await supabase.rpc('core_v2_rename_organization', { p_name: companyName })
if (orgErr || od?.ok !== true) { const e = orgErr?.message || od?.code || 'save_failed'; console.error('saveProfile — organization rename failed:', e); return { error: e } }
org.value = { ...org.value, name: companyName }
}
if (profile.value) profile.value = { ...profile.value, ...payload, company_name: org.value?.name || '' }
if (me.value) me.value = { ...me.value, ...payload }
return { success: true }
} catch (e) { console.error('saveProfile — unexpected failure:', e.message || e); return { error: e.message || String(e) } }
}
// E-04: in-app password change — TRUTHFUL verification of the current password
// (signInWithPassword for the same user: GoTrue v2 exposes no dedicated reauth),
// then updateUser. Errors mapped by their real cause (reset pattern 17/07).
async function changePassword(currentPwd, newPwd) {
if (!user.value?.email) return { error: 'no_user' }
try {
const { error: signErr } = await supabase.auth.signInWithPassword({ email: user.value.email, password: currentPwd })
if (signErr) {
console.warn('[pwd] current check failed:', signErr.code || signErr.status, signErr.message)
if (signErr.status === 429 || signErr.code === 'over_request_rate_limit') return { error: 'rate_limit' }
return { error: 'wrong_current' }
}
const { error: updErr } = await supabase.auth.updateUser({ password: newPwd })
if (updErr) {
console.warn('[pwd] updateUser failed:', updErr.code || updErr.status, updErr.message)
if (updErr.code === 'same_password') return { error: 'same_password' }
if (updErr.status === 429) return { error: 'rate_limit' }
return { error: 'generic' }
}
return { success: true }
} catch (e) { console.warn('[pwd] unexpected failure:', e.message || e); return { error: 'generic' } }
}
async function logout() {
// IDLE-5H: the stamp goes with the session. Left behind, the next account to log in on
// this browser starts its 5 h already partly spent.
try { clearActivity(); clearAllStores(); await clearAllStoreData(); await supabase.auth.signOut() } catch (e) {}
finally { user.value = null; me.value = null; profile.value = null; org.value = null; session.value = null; setReadOnlyWrites(false); loading.value = false; error.value = null }
}
async function resetPassword(email) {
try { const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/reset-password-confirm` }); if (error) return { error }; return { success: true } } catch (error) { return { error } }
}
return {
user, me, profile, org, loading, error,
isAuthenticated, fullName, greeting,
hasActiveSubscription, isOnTrial, trialExpired, trialDaysLeft, trialUsed, needsPayment, isAlphaTester, readOnly, period,
isOnBetaAccess, orgTrialDaysLeft,
userLocale, userRegion, userAppLocale, currentPlan, currentPlanLabel, effectivePlan, seatsPaid, onboardingCompleted, orgRole, isOrgOwner,
session, company, displayName, roleLabel,
init, login, register, logout, clearAllStores, saveLocale, saveRegion, saveProfile, changePassword, fetchProfile, resetPassword,
pendingInviteResult, clearPendingInviteResult, acceptPendingInvite
}
})

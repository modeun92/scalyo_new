import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { supabase } from '@/lib/supabase'
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
const ts = useTaskStore(); ts.tasks.length = 0; ts.projects.length = 0
} catch(e) {}
}
function clearSupabaseStorage() {
try { Object.keys(localStorage).filter(k => k.startsWith('sb-')).forEach(k => localStorage.removeItem(k)) } catch (_) {}
}
async function resetGoTrueClient() {
try { await Promise.race([supabase.auth.signOut({ scope: 'local' }), new Promise(r => setTimeout(r, 2000))]) } catch (_) {}
}
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
const TRIAL_DAYS = 14
export const useAuthStore = defineStore('auth', () => {
const user = ref(null)
const session = ref(null)
const profile = ref(null)
const org = ref(null)
const orgRole = ref(null)
const loading = ref(false)
const error = ref(null)
const isAuthenticated = computed(() => !!user.value)
const fullName = computed(() => { if (!profile.value) return ''; return (profile.value.first_name + ' ' + profile.value.last_name).trim() })
const greeting = computed(() => { const h = new Date().getHours(); if (h < 12) return 'morning'; if (h < 18) return 'afternoon'; return 'evening' })
const hasActiveSubscription = computed(() => { const sub = profile.value?.stripe_subscription_id; return !!sub && sub !== '' && sub !== 'none' })
const trialStartedAt = computed(() => { const d = profile.value?.trial_started_at; return d ? new Date(d) : null })
const trialUsed = computed(() => !!profile.value?.trial_used)
const trialDaysLeft = computed(() => { if (!trialStartedAt.value) return 0; const elapsed = (Date.now() - trialStartedAt.value.getTime()) / (1000 * 60 * 60 * 24); return Math.max(0, TRIAL_DAYS - Math.floor(elapsed)) })
// D1 (contrat gating 8/07) : acces beta = etat de l'ORG (promo), pas du profil
const orgTrialDaysLeft = computed(() => { const e = org.value?.trial_ends_at; if (!e) return 0; return Math.max(0, Math.ceil((new Date(e).getTime() - Date.now()) / 86400000)) })
const isOnBetaAccess = computed(() => { if (!org.value) return false; if (org.value.stripe_subscription_id) return false; return !!org.value.trial_ends_at && orgTrialDaysLeft.value > 0 })
// PAYWALL-MEMBER (04/08/2026) : le droit d'acces est une propriete de l'ORGANISATION
// (facturation per-seat), pas du profil. Une org qui paie OU qui est en acces beta
// couvre TOUS ses membres, y compris ceux dont l'essai personnel est consomme.
const orgGrantsAccess = computed(() => { const s = org.value?.stripe_subscription_id; return (!!s && s !== '' && s !== 'none') || isOnBetaAccess.value })
const isOnTrial = computed(() => { if (hasActiveSubscription.value) return false; if (isOnBetaAccess.value) return false; if (org.value?.stripe_subscription_id) return false; if (!trialStartedAt.value) return false; if (trialUsed.value) return false; return trialDaysLeft.value > 0 })
// PAYWALL-MEMBER : garde ORG manquante ici — isOnTrial (L au-dessus) la portait deja,
// trialExpired ne l'avait pas, d'ou le membre d'une org abonnee renvoye au paywall.
// hasActiveSubscription N'EST PAS touche a dessein : SettingsBilling/PaymentSuccessView
// s'en servent pour afficher le statut d'abonnement PERSONNEL (un membre ne gere pas
// l'abonnement de son org) — l'elargir ferait apparaitre un bloc de gestion mensonger.
const trialExpired = computed(() => { if (hasActiveSubscription.value) return false; if (orgGrantsAccess.value) return false; if (isOnTrial.value) return false; if (!trialStartedAt.value && !trialUsed.value) return false; if (trialStartedAt.value && trialDaysLeft.value === 0) return true; if (trialUsed.value) return true; return false })
const isAlphaTester = computed(() => !!profile.value?.is_alpha_tester)
const needsPayment = computed(() => trialExpired.value && !hasActiveSubscription.value && !isAlphaTester.value)
// D1 : source unique = organizations.plan quand l'org existe ; chaine profil = fallback comptes sans org
const currentPlan = computed(() => { if (org.value?.plan) return org.value.plan; const sub = profile.value?.stripe_subscription_id; if (!sub || sub === '' || sub === 'none') { if ((isOnTrial.value || isAlphaTester.value) && profile.value?.plan) return profile.value.plan; return null }; if (sub.startsWith('stripe_') || sub.startsWith('plan_')) return sub.split('_').pop(); return profile.value?.plan || 'active' })
// D6 (A-02/E-03) : label du plan pour l'UI — jamais vide
const currentPlanLabel = computed(() => { const p = currentPlan.value; if (!p) return 'Starter'; return p.charAt(0).toUpperCase() + p.slice(1) })
// V1 gating : plan effectif jamais nul → starter (le plus restrictif). Évite getMaxClients(null)=0 qui bloquerait toute création.
const effectivePlan = computed(() => currentPlan.value || 'starter')
const userLocale = computed(() => profile.value?.locale || localStorage.getItem('scalyo_locale') || 'fr')
// SEATS-MISMATCH (25/08) : sièges payés = organizations.seats_paid (quantité Stripe), le profil
// n'est qu'un repli comptes sans org — lu sur le profil d'un Member, ça donnait 1.
const seatsPaid = computed(() => org.value?.seats_paid ?? profile.value?.seats_paid ?? 1)
const onboardingCompleted = computed(() => profile.value?.onboarding_completed === true)
const isOrgOwner = computed(() => orgRole.value === 'owner')
const company = computed(() => {
  if (!profile.value) return null
  return {
    name: profile.value.company_name || '',
    planLabel: currentPlan.value ? currentPlan.value.charAt(0).toUpperCase() + currentPlan.value.slice(1) : 'Starter',
    country: profile.value.country || 'FR',
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
async function startTrial(userId) {
try {
const now = new Date().toISOString()
const { error: err } = await supabase.from('profiles').update({ trial_started_at: now, trial_used: false }).eq('id', userId)
if (err) { console.error('startTrial failed:', err.message); return }
profile.value = { ...profile.value, trial_started_at: now, trial_used: false }
} catch (e) { console.error('startTrial error:', e.message || e) }
}
async function init() {
loading.value = true
error.value = null
try {
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
// Lot 6 / INV-CONFIRM-TOKEN : une session peut s'ouvrir SANS passer par login() —
// c'est le cas du lien « Confirm email address » de Supabase, qui connecte
// directement. acceptPendingInvite n'etait branche que sur login() L230 : un
// invite qui s'inscrivait puis confirmait son email arrivait dans une org vide,
// alors que l'ecran join_confirm_email lui promettait l'activation automatique.
// Place ICI et pas dans le callback onAuthStateChange : G9-13 / R22 interdisent
// tout appel awaite dans ce callback (deadlock GoTrue). acceptPendingInvite ne
// fait que des fetch() vers /api, sort immediatement si aucun jeton n'est en
// attente (cout nul au boot nominal), et verifie l'email vise avant de rejouer.
try { await acceptPendingInvite(sess.access_token) } catch (e) { console.error('init — acceptPendingInvite:', e?.message || e) }
await loadAllStores()
}
} catch (e) {
console.error('Auth init timeout/failure:', e.message || e)
error.value = typeof e === 'object' && e.message ? e.message : String(e)
clearSupabaseStorage()
await resetGoTrueClient()
} finally {
loading.value = false
}
// G9-13 : callback SYNCHRONE — jamais d'appel Supabase awaité dans un callback
// onAuthStateChange (doc officielle). Le client attend les callbacks pendant le
// refresh (_notifyAllSubscribers) : un appel Supabase ici re-entre dans le client
// et formait le cycle du gel. fetchProfile est différé hors du cycle de
// notification (setTimeout 0), fire-and-forget, erreurs logguées.
supabase.auth.onAuthStateChange((_event, sess) => {
if (sess && sess.user) {
user.value = sess.user
session.value = sess
setTimeout(() => { fetchProfile(sess.user.id).catch((e) => console.error('Auth state change error:', e?.message || e)) }, 0)
}
else { user.value = null; profile.value = null; org.value = null; session.value = null }
})
}
async function fetchOrgRole() {
    try {
      orgRole.value = profile.value?.org_role || 'member'
    } catch (e) { console.error('fetchOrgRole:', e) }
  }
// D1 : lecture de l'org via la policy org_view (SELECT membre, verifiee SQL 8/07) — echec = fallback profil, zero crash (contrat §5)
async function fetchOrg() {
const orgId = profile.value?.organization_id
if (!orgId) { org.value = null; return }
try {
const { data, error: err } = await supabase.from('organizations').select('id, name, plan, seats_paid, trial_ends_at, is_founding, max_clients, stripe_subscription_id').eq('id', orgId).single()
if (err) { console.error('fetchOrg failed:', err.message); return }
if (data) org.value = data
} catch (e) { console.error('fetchOrg error:', e.message || e) }
}
async function fetchProfile(userId) {
try {
const { data, error: err } = await supabase.from('profiles').select('*').eq('id', userId).single()
if (err) { console.error('fetchProfile failed:', err.message); return }
if (data) {
profile.value = data
      orgRole.value = data?.org_role || 'member'
await fetchOrg()
if (data.trial_started_at && !data.trial_used) {
const elapsed = (Date.now() - new Date(data.trial_started_at).getTime()) / (1000 * 60 * 60 * 24)
if (elapsed >= TRIAL_DAYS) {
await supabase.from('profiles').update({ trial_used: true }).eq('id', userId)
profile.value = { ...profile.value, trial_used: true }
}
}
}
} catch (e) { console.error('fetchProfile error:', e.message || e) }
}
const PENDING_INVITE_KEY = 'scalyo_pending_invite'
// Lot 6 — resultat de la derniere tentative d'acceptation differee, pour que
// l'interface l'AFFICHE au lieu de l'avaler (contrat INVITATIONS §4d).
const pendingInviteResult = ref(null)
function clearPendingInviteResult() { pendingInviteResult.value = null }
function dropPendingInvite() { try { localStorage.removeItem(PENDING_INVITE_KEY) } catch (_) {} }
async function acceptPendingInvite(accessToken) {
let token = null
try { token = localStorage.getItem(PENDING_INVITE_KEY) } catch (_) {}
if (!token || !accessToken) return
// Lot 6 / INVITE-ANY-USER : on ne rejoue le jeton QUE si l'invitation vise
// bien le compte qui vient de se connecter. Sans ce controle, un jeton laisse
// dans le navigateur par une inscription echouee changeait l'organisation de
// l'utilisateur suivant, en silence, sans ecran ni confirmation.
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
} catch (_) { return } // erreur reseau : jeton conserve pour un retry ulterieur
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
} catch (_) { /* erreur reseau : token conserve pour retry au prochain login (contrat CR-1 §5) */ }
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
user.value = data.user
session.value = data.session || null
await fetchProfile(data.user.id)
await acceptPendingInvite(data.session?.access_token)
if (profile.value && !profile.value.trial_started_at && !profile.value.trial_used && !profile.value.is_alpha_tester) { await startTrial(data.user.id) } // D3 : jamais d'essai profil pour un alpha (l'org porte l'acces promo)
await loadAllStores()
return { success: true }
} catch (e) {
console.error('login failure:', e.message || e)
error.value = typeof e === 'object' && e.message ? e.message : String(e)
if (e.message === 'login_timeout') { clearSupabaseStorage(); await resetGoTrueClient() }
return { success: false, error: error.value }
} finally { loading.value = false }
}
async function register(email, password, firstName, lastName, locale = 'fr') {
loading.value = true
error.value = null
try {
const { data, error: err } = await supabase.auth.signUp({ email, password, options: { data: { first_name: firstName, last_name: lastName, locale }, emailRedirectTo: `${window.location.origin}/login?verified=true` } })
if (err) { error.value = err.message; return { success: false, error: err.message } }
if (data.user) { fetch(SUPABASE_URL + '/functions/v1/send-welcome-email', { method: 'POST', headers: { 'Content-Type': 'application/json', 'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY }, body: JSON.stringify({ email, firstName, lastName }) }).catch(() => {}) }
return { success: true, needsConfirmation: !data.session, user: data.user }
} catch (e) { error.value = typeof e === 'object' && e.message ? e.message : String(e); return { success: false, error: error.value } }
finally { loading.value = false }
}
async function saveLocale(locale) {
if (!user.value) return { error: 'no_user' }
try {
const { error: err } = await supabase.from('profiles').update({ locale }).eq('id', user.value.id)
if (err) { console.error('saveLocale — update failed:', err.message); return { error: err.message } }
if (profile.value) profile.value = { ...profile.value, locale }
// Cohérence pages publiques (landing/login) : même langue que l'app
try { localStorage.setItem('scalyo_locale', locale) } catch (_) {}
return { success: true }
} catch (e) { console.error('saveLocale — unexpected failure:', e.message || e); return { error: e.message || String(e) } }
}
// E-04 : sauvegarde profil réelle — même contrat de retour que saveLocale ({success}/{error})
async function saveProfile(fields) {
if (!user.value) return { error: 'no_user' }
const payload = {
first_name: (fields.first_name || '').trim(),
last_name: (fields.last_name || '').trim(),
company_name: (fields.company_name || '').trim()
}
try {
const { error: err } = await supabase.from('profiles').update(payload).eq('id', user.value.id)
if (err) { console.error('saveProfile — update failed:', err.message); return { error: err.message } }
if (profile.value) profile.value = { ...profile.value, ...payload }
return { success: true }
} catch (e) { console.error('saveProfile — unexpected failure:', e.message || e); return { error: e.message || String(e) } }
}
// E-04 : changement de mot de passe in-app — vérification VÉRIDIQUE du mdp actuel
// (signInWithPassword du même user : GoTrue v2 n'expose pas de reauth dédiée),
// puis updateUser. Erreurs mappées par cause réelle (pattern reset 17/07).
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
try { clearAllStores(); await clearAllStoreData(); await supabase.auth.signOut() } catch (e) {}
finally { user.value = null; profile.value = null; org.value = null; session.value = null; loading.value = false; error.value = null }
}
async function resetPassword(email) {
try { const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/reset-password-confirm` }); if (error) return { error }; return { success: true } } catch (error) { return { error } }
}
return {
user, profile, org, loading, error,
isAuthenticated, fullName, greeting,
hasActiveSubscription, isOnTrial, trialExpired, trialDaysLeft, trialUsed, needsPayment, isAlphaTester,
isOnBetaAccess, orgTrialDaysLeft,
userLocale, currentPlan, currentPlanLabel, effectivePlan, seatsPaid, onboardingCompleted, orgRole, isOrgOwner,
session, company, displayName, roleLabel,
init, login, register, logout, clearAllStores, saveLocale, saveProfile, changePassword, fetchProfile, fetchOrg, resetPassword,
pendingInviteResult, clearPendingInviteResult, acceptPendingInvite
}
})

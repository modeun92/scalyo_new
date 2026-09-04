<template>
  <div class="team_view">
    <div class="team_header">
      <h2>{{ t('team_title') }}</h2>
      <div v-if="org" class="seat_badge">{{ seats.used }} / {{ seatsCap }} {{ t('team_seats') }}</div>
    </div>

    <div v-if="loading" class="team_loading"><span class="spinner" /></div>

    <template v-else>
      <!-- Invite form (owner/admin only) -->
      <div v-if="canInvite" class="invite_section">
        <h3>{{ t('team_invite_title') }}</h3>
        <div class="invite_form">
          <input v-model="inviteEmail" type="email" class="field_input" :placeholder="t('team_invite_email_ph')" />
          <select v-model="inviteRole" class="field_input field_input_select">
            <option v-for="r in availableRoles" :key="r" :value="r">{{ t('role_' + r) }}</option>
          </select>
          <button class="button_primary" :disabled="sending || !inviteEmail.trim()" @click="sendInvite">
            <span v-if="sending" class="spinner_small" /><span v-else>{{ t('team_invite_send') }}</span>
          </button>
        </div>
        <div v-if="inviteMsg" class="invite_message" :class="inviteMsgType">{{ inviteMsg }}</div>
      </div>

      <!-- Members list -->
      <div class="section">
        <h3>{{ t('team_members_title') }} ({{ members.length }})</h3>
        <div class="table_wrapper">
          <table class="team_table">
            <thead><tr><th>{{ t('team_col_name') }}</th><th>{{ t('team_col_role') }}</th><th>{{ t('team_col_joined') }}</th><th></th></tr></thead>
            <tbody>
              <tr v-for="m in members" :key="m.id">
                <td>{{ memberLabel(m) }}</td>
                <td><span class="role_tag" :class="'role_' + m.role">{{ t('role_' + m.role) }}</span></td>
                <td>{{ formatDate(m.joined_at) }}</td>
                <td><button v-if="canRemove(m)" class="button_remove" @click="askRemoveMember(m)">{{ t('team_remove') }}</button></td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- Pending invitations -->
      <div v-if="invitations.length > 0" class="section">
        <h3>{{ t('team_pending_title') }} ({{ invitations.length }})</h3>
        <div class="table_wrapper">
          <table class="team_table">
            <thead><tr><th>{{ t('team_col_email') }}</th><th>{{ t('team_col_role') }}</th><th>{{ t('team_col_expires') }}</th><th></th></tr></thead>
            <tbody>
              <tr v-for="inv in invitations" :key="inv.id">
                <td>{{ inv.email }}</td>
                <td><span class="role_tag" :class="'role_' + inv.role">{{ t('role_' + inv.role) }}</span></td>
                <td>{{ formatDate(inv.expires_at) }} <span v-if="isExpired(inv)" class="badge_expired">{{ t('team_expired_badge') }}</span></td>
                <td class="cell_actions">
                  <button v-if="inv.token" class="button_copy" @click="copyInviteLink(inv)">{{ copiedId === inv.id ? t('team_link_copied') : t('team_copy_link') }}</button>
                  <button v-if="canRevokeInvitations" class="button_remove" @click="askRevokeInvitation(inv)">{{ t('team_revoke') }}</button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
      <!-- NO-CONFIRM (SEAT-RM): confirmation INSIDE the product, never a native confirm().
           Shared ConfirmDialog component (COPIL-LAYOUT batch), identical rendering. -->
      <ConfirmDialog v-if="confirmAction" :title="confirmAction.title" :body="confirmAction.body" :cta="confirmAction.cta" :busy="confirmBusy" @confirm="runConfirmAction" @cancel="closeConfirm" />
    </template>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useAuthStore } from '@/stores/auth'
import { useTeamStore } from '@/stores/team'
import { supabase } from '@/lib/supabase'
import { fmtDate } from '@/lib/formatters'
import { getAvailableRolesForInvite, canPerform } from '@/config/plans.config.js' // isRoleAbove: dead import removed
import ConfirmDialog from '@/components/ConfirmDialog.vue'

const { t } = useI18n({ useScope: 'global' })
const authStore = useAuthStore()

// Workstream A: the badge displays the plan ceiling (maxSeats), not seats_paid. Enterprise (null) → ∞.
// SEATS-MISMATCH: ceiling read from the team store (same source as Manager)
const teamStore = useTeamStore()
const seatsCap = computed(() => teamStore.seatsCap === null ? '∞' : teamStore.seatsCap)

const loading = ref(true)
const org = ref(null)
const members = ref([])
const invitations = ref([])
const seats = ref({ used: 0, paid: 0 })
const myRole = ref('')
const inviteEmail = ref('')
const inviteRole = ref('member')
const sending = ref(false)
const inviteMsg = ref('')
const inviteMsgType = ref('')
const copiedId = ref(null)
// Raw UUID fix: map user_id → full name, resolved via RPC get_org_member_names (same pattern as chat G9-21)
const memberNames = ref({})

const canInvite = computed(() => canPerform(myRole.value, 'canInvite'))
const canRevokeInvitations = computed(() => canPerform(myRole.value, 'canRevoke'))
const availableRoles = computed(() => org.value ? getAvailableRolesForInvite(org.value.plan) : ['member'])

onMounted(() => { loadTeam(); loadMemberNames() })

// Name resolution at render time — fallback = truncated UUID, never a crash (contract §5)
async function loadMemberNames() {
  try {
    const { data, error } = await supabase.rpc('get_org_member_names')
    if (error) {
      console.error('loadMemberNames — rpc failed:', error.message)
      return
    }
    const map = {}
    for (const r of data || []) {
      const full = ((r.first_name || '').trim() + ' ' + (r.last_name || '').trim()).trim()
      if (full) map[r.user_id] = full
    }
    memberNames.value = map
  } catch (e) {
    console.error('loadMemberNames — unexpected failure:', e.message || e)
  }
}

function memberLabel(m) {
  return memberNames.value[m.user_id] || (m.user_id || '').slice(0, 8) + '…'
}

async function loadTeam() {
  loading.value = true
  try {
    const token = (await supabase.auth.getSession()).data.session?.access_token
    if (!token) return
    const resp = await fetch('/api/members', { headers: { 'Authorization': 'Bearer ' + token } })
    if (!resp.ok) return
    const data = await resp.json()
    org.value = data.organization
    members.value = data.members || []
    invitations.value = data.invitations || []
    seats.value = data.seats || { used: 0, paid: 0 }
    const me = members.value.find(m => m.user_id === authStore.user?.id)
    myRole.value = me?.role || ''
  } catch (e) { console.error('Team load error:', e) }
  finally { loading.value = false }
}

async function sendInvite() {
  if (sending.value || !inviteEmail.value.trim()) return
  sending.value = true; inviteMsg.value = ''
  try {
    const resp = await fetch('/api/invite', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + (await supabase.auth.getSession()).data.session?.access_token },
      body: JSON.stringify({ email: inviteEmail.value.trim(), role: inviteRole.value })
    })
    const data = await resp.json()
    if (resp.ok) {
      // INV-EMAIL: end of the false success — the message reflects the actual email send
      inviteMsg.value = data.email_sent ? t('team_invite_sent_email') : t('team_invite_no_email')
      inviteMsgType.value = data.email_sent ? 'success' : 'warn'
      inviteEmail.value = ''; await loadTeam()
    } else { inviteMsg.value = data.error || t('team_invite_error'); inviteMsgType.value = 'error' }
  } catch { inviteMsg.value = t('team_invite_error'); inviteMsgType.value = 'error' }
  finally { sending.value = false }
}

function canRemove(m) {
  if (m.user_id === authStore.user?.id) return false
  if (m.role === 'owner') return false
  return canPerform(myRole.value, 'canRevoke')
}

// NO-CONFIRM (SEAT-RM): the confirmation goes through a product modal.
// A native confirm() is forbidden — it also blocks any automated evidence capture.
const confirmAction = ref(null)
const confirmBusy = ref(false)

function closeConfirm() { if (!confirmBusy.value) confirmAction.value = null }

async function runConfirmAction() {
  if (!confirmAction.value || confirmBusy.value) return
  confirmBusy.value = true
  try { await confirmAction.value.run() }
  finally { confirmBusy.value = false; confirmAction.value = null }
}

// The Functions return a stable machine code (errorCode, Lot 6). The translation
// happens HERE, where the user's language is known — the Function does not guess it.
const KNOWN_ERRORS = ['billing_update_failed', 'billing_failed', 'cannot_remove_owner',
  'cannot_remove_self', 'insufficient_role', 'member_not_found', 'permission_denied']
function errorLabel(code, fallbackKey) {
  return code && KNOWN_ERRORS.includes(code) ? t('team_err_' + code) : t(fallbackKey)
}

function askRemoveMember(m) {
  confirmAction.value = {
    title: t('team_remove_confirm_title'),
    body: t('team_remove_confirm'),
    cta: t('team_remove'),
    run: () => doRemoveMember(m),
  }
}

// SEAT-RM: the server's response is READ and displayed. Before, a 403
// cannot_remove_owner was invisible — the list simply reloaded unchanged.
async function doRemoveMember(m) {
  inviteMsg.value = ''
  try {
    const resp = await fetch('/api/members/' + m.id, {
      method: 'DELETE',
      headers: { 'Authorization': 'Bearer ' + (await supabase.auth.getSession()).data.session?.access_token }
    })
    if (resp.ok) { inviteMsg.value = t('team_removed_ok'); inviteMsgType.value = 'success' }
    else {
      const d = await resp.json().catch(() => ({}))
      inviteMsg.value = errorLabel(d.code, 'team_remove_error'); inviteMsgType.value = 'error'
    }
    await loadTeam()
  } catch { inviteMsg.value = t('team_remove_error'); inviteMsgType.value = 'error' }
}

// Workstream C: lazy expiry — the status stays pending, we flag the past date visually
function isExpired(inv) { return inv.expires_at && new Date(inv.expires_at) < new Date() }

function askRevokeInvitation(inv) {
  confirmAction.value = {
    title: t('team_revoke_confirm_title'),
    body: t('team_revoke_confirm'),
    cta: t('team_revoke'),
    run: () => doRevokeInvitation(inv),
  }
}

async function doRevokeInvitation(inv) {
  try {
    const resp = await fetch('/api/invitations/' + inv.id, {
      method: 'DELETE',
      headers: { 'Authorization': 'Bearer ' + (await supabase.auth.getSession()).data.session?.access_token }
    })
    if (resp.ok) { inviteMsg.value = t('team_revoked_ok'); inviteMsgType.value = 'success' }
    else { const d = await resp.json().catch(() => ({})); inviteMsg.value = errorLabel(d.code, 'team_revoke_error'); inviteMsgType.value = 'error' }
    await loadTeam()
  } catch { inviteMsg.value = t('team_revoke_error'); inviteMsgType.value = 'error' }
}

// INV-EMAIL: copyable invitation link (owner/admin — /api/members only serves the token to them)
async function copyInviteLink(inv) {
  const url = window.location.origin + '/join?token=' + inv.token
  try {
    await navigator.clipboard.writeText(url)
    copiedId.value = inv.id
    setTimeout(() => { copiedId.value = null }, 2000)
  } catch {
    // Clipboard denied → the link is displayed for manual copying (contract §5)
    inviteMsg.value = url; inviteMsgType.value = 'success'
  }
}

// E-15b: date in the APP locale (central formatter), never again the browser locale
function formatDate(d) { return d ? fmtDate(d) : '' }
</script>

<style scoped>
.team_view { max-width: 800px; margin: 0 auto; padding: 32px 20px; }
.team_header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 28px; }
.team_header h2 { font-size: 1.3rem; font-weight: 800; }
.seat_badge { background: #f3f4f6; padding: 6px 14px; border-radius: 20px; font-size: 0.82rem; font-weight: 600; color: var(--text-primary); }
.team_loading { text-align: center; padding: 60px 0; }
.section { margin-bottom: 32px; }
.section h3 { font-size: 0.95rem; font-weight: 700; margin-bottom: 12px; color: var(--text-primary); }
.invite_section { background: #faf5ff; border: 1px solid #e9d5ff; border-radius: 12px; padding: 20px; margin-bottom: 28px; }
.invite_section h3 { margin-bottom: 12px; }
.invite_form { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
.invite_form .field_input { flex: 1; min-width: 180px; }
.field_input { padding: 10px 14px; border: 1px solid var(--border-color); border-radius: 8px; font-size: 0.88rem; outline: none; }
.field_input:focus { border-color: #7c3aed; }
.field_input_select { max-width: 140px; }
.invite_message { font-size: 0.82rem; margin-top: 8px; padding: 8px 12px; border-radius: 6px; }
.invite_message.success { background: #f0fdf4; color: #166534; }
.invite_message.error { background: #fef2f2; color: #dc2626; }
.invite_message.warn { background: #fffbeb; color: #92400e; }
.table_wrapper { overflow-x: auto; }
.team_table { width: 100%; border-collapse: collapse; font-size: 0.88rem; }
.team_table th { text-align: left; padding: 10px 12px; border-bottom: 2px solid var(--border-color); color: #6b7280; font-weight: 600; font-size: 0.78rem; text-transform: uppercase; letter-spacing: 0.04em; }
.team_table td { padding: 12px; border-bottom: 1px solid #f3f4f6; }
.role_tag { padding: 3px 10px; border-radius: 12px; font-size: 0.75rem; font-weight: 600; }
.role_owner { background: #7c3aed; color: #fff; }
.role_admin { background: #dbeafe; color: #1d4ed8; }
.role_member { background: #f3f4f6; color: var(--text-primary); }
.role_viewer { background: #fef3c7; color: #92400e; }
.badge_expired { background: #fef2f2; color: #dc2626; border: 1px solid #fecaca; padding: 2px 8px; border-radius: 10px; font-size: 0.7rem; font-weight: 600; margin-left: 6px; }
.button_primary { background: #7c3aed; color: #fff; border: none; padding: 10px 18px; border-radius: 8px; font-size: 0.85rem; font-weight: 600; cursor: pointer; white-space: nowrap; }
.button_primary:hover:not(:disabled) { background: #6d28d9; }
.button_primary:disabled { opacity: 0.4; cursor: not-allowed; }
.button_remove { background: none; border: 1px solid #fecaca; color: #dc2626; padding: 4px 12px; border-radius: 6px; font-size: 0.78rem; cursor: pointer; }
.button_remove:hover { background: #fef2f2; }
.cell_actions { white-space: nowrap; }
.button_copy { background: none; border: 1px solid #ddd6fe; color: #7c3aed; padding: 4px 12px; border-radius: 6px; font-size: 0.78rem; cursor: pointer; margin-right: 6px; }
.button_copy:hover { background: #faf5ff; }
.spinner { width: 18px; height: 18px; border: 2px solid rgba(124,58,237,0.2); border-top-color: #7c3aed; border-radius: 50%; animation: spin 0.7s linear infinite; display: inline-block; }
.spinner_small { width: 14px; height: 14px; border: 2px solid rgba(255,255,255,0.3); border-top-color: #fff; border-radius: 50%; animation: spin 0.7s linear infinite; display: inline-block; }
@keyframes spin { to { transform: rotate(360deg); } }
@media (max-width: 640px) { .invite_form { flex-direction: column; } .invite_form .field_input { min-width: 100%; } }
</style>
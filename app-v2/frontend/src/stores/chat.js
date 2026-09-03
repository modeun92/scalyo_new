import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { supabase } from '@/lib/supabase'
import { withWrite } from '@/lib/supabaseWrite'
import { useAuthStore } from '@/stores/auth'

const MAX_MESSAGE_LENGTH = 5000
const MESSAGES_PER_PAGE = 100
const SEND_COOLDOWN_MS = 1000
const REALTIME_RECONNECT_DELAYS = [1000, 2000, 5000, 10000, 30000]
const MAX_REALTIME_RETRIES = 10
const REALTIME_FAILSAFE_MS = 120000
const POLL_BASE_MS = 6000
const POLL_MAX_MS = 30000

export const useChatStore = defineStore('chat', () => {
const channels = ref([])
const messages = ref({})
const activeChannel = ref(null)
const editingMessage = ref(null)
const replyingTo = ref(null)
const unreadCounts = ref({})
const connected = ref(false)
// G9-20: is the chat surface (panel or page) visible? Distinct from the active channel.
const surfaceVisible = ref(false)
// G9-21: map user_id → first name, resolved via RPC get_org_member_names (profiles RLS = self-only)
const memberNames = ref({})

const channelsLoading = ref(false)
const messagesLoading = ref(false)
const sending = ref(false)
const lastError = ref(null)
const lastRealtimeError = ref(null)

let realtimeSub = null
let realtimeRetryCount = 0
let realtimeRetryTimer = null
let realtimeFailsafeTimer = null
let pollTimer = null
let pollDelay = POLL_BASE_MS
let pollBusy = false
let lastSendTime = 0
let realtimeGaveUpListener = null
// Anti-storm guard: once the abandon is recorded, residual CLOSED events
// (including the one triggered by our own unsubscribe) are no longer logged.
let realtimeGaveUp = false

const activeMessages = computed(() => activeChannel.value ? (messages.value[activeChannel.value] || []) : [])
const pinnedMessages = computed(() => activeMessages.value.filter(m => m.pinned))
const totalUnread = computed(() => Object.values(unreadCounts.value).reduce((a, b) => a + b, 0))

// ─── Init ──────────────────────────────────────────────────────────────────
async function init() {
  try {
    await loadChannels()
    loadMemberNames()
    if (channels.value.length > 0 && !activeChannel.value) {
      activeChannel.value = channels.value[0].id
    }
    if (activeChannel.value) await loadMessages(activeChannel.value)
    subscribeRealtime()
  } catch (e) {
    console.error('Chat init failed:', e.message || e)
    lastError.value = 'init_failed'
  }
}

async function loadChannels() {
  channelsLoading.value = true
  try {
    const { data, error } = await supabase.from('chat_channels').select('*').order('created_at')
    if (error) {
      console.error('loadChannels — query failed:', error.message)
      lastError.value = 'load_channels_failed'
      return
    }
    if (data) {
      channels.value = data
      if (data.some(c => c.type === 'dm')) await loadDmMembers()
    }
  } catch (e) {
    console.error('loadChannels — unexpected failure:', e.message || e)
    lastError.value = 'load_channels_failed'
  } finally {
    channelsLoading.value = false
  }
}

async function loadMessages(channelId, before = null) {
  messagesLoading.value = true
  try {
    let query = supabase
      .from('chat_messages')
      .select('*')
      .eq('channel_id', channelId)
      .order('created_at', { ascending: true })
      .limit(MESSAGES_PER_PAGE)
    if (before) query = query.lt('created_at', before)
    const { data, error } = await query
    if (error) {
      console.error('loadMessages — query failed:', error.message)
      lastError.value = 'load_messages_failed'
      return
    }
    if (data) {
      const mapped = data.map(mapMsg)
      if (before && messages.value[channelId]) {
        messages.value[channelId] = [...mapped, ...messages.value[channelId]]
      } else {
        messages.value[channelId] = mapped
      }
    }
  } catch (e) {
    console.error('loadMessages — unexpected failure:', e.message || e)
    lastError.value = 'load_messages_failed'
  } finally {
    messagesLoading.value = false
  }
}

async function loadOlderMessages(channelId) {
  const existing = messages.value[channelId]
  if (!existing || existing.length === 0) return
  const oldest = existing[0].timestamp
  await loadMessages(channelId, oldest)
}

function mapMsg(m) {
  const ts = m.created_at
  return {
    id: m.id, channelId: m.channel_id, author: m.author_name, authorId: m.user_id,
    content: m.content, timestamp: ts, pinned: m.pinned || false,
    reactions: m.reactions || [], attachments: m.attachments || [],
    replyTo: m.reply_to, editedAt: m.edited_at,
    date: ts ? ts.slice(0, 10) : '',
    edited: !!m.edited_at
  }
}

// G9-21: name resolution at render time (fallback = stored author_name, never a crash)
async function loadMemberNames() {
  try {
    const { data, error } = await supabase.rpc('get_org_member_names')
    if (error) {
      console.error('loadMemberNames — rpc failed:', error.message)
      return
    }
    const map = {}
    for (const r of data || []) {
      const n = (r.first_name || '').trim() || (r.last_name || '').trim()
      if (n) map[r.user_id] = n
    }
    memberNames.value = map
  } catch (e) {
    console.error('loadMemberNames — unexpected failure:', e.message || e)
  }
}

function authorLabel(msg) {
  return memberNames.value[msg.authorId] || msg.author || ''
}

// ─── Realtime with auto-reconnect ──────────────────────────────────────────
async function subscribeRealtime() {
  realtimeGaveUp = false
  if (realtimeRetryTimer) { clearTimeout(realtimeRetryTimer); realtimeRetryTimer = null }
  // Clean retry: remove the old channel from the client (await) before recreating one
  // on the same topic — otherwise duplicate joins are possible during retries.
  if (realtimeSub) {
    const old = realtimeSub
    realtimeSub = null
    try { await supabase.removeChannel(old) } catch (_) {}
  }
  try {
    const ch = supabase.channel('chat-realtime')
    realtimeSub = ch
    ch
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_messages' }, (payload) => {
        try {
          const msg = mapMsg(payload.new)
          if (!messages.value[msg.channelId]) messages.value[msg.channelId] = []
          const exists = messages.value[msg.channelId].some(m => m.id === msg.id)
          if (!exists) {
            messages.value[msg.channelId].push(msg)
            // G9-20: unread if the chat surface is closed OR if the channel is not the displayed one
            if (!surfaceVisible.value || msg.channelId !== activeChannel.value) {
              unreadCounts.value[msg.channelId] = (unreadCounts.value[msg.channelId] || 0) + 1
            }
            // G9-22: channel created after boot → unknown to the list (no realtime on
            // chat_channels) → we reload the channels when an unknown channel_id is discovered
            if (!channels.value.some(c => c.id === msg.channelId)) loadChannels()
          }
        } catch (e) { console.error('Realtime INSERT handler failed:', e.message || e) }
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'chat_messages' }, (payload) => {
        try {
          const updated = mapMsg(payload.new)
          const arr = messages.value[updated.channelId]
          if (arr) {
            const idx = arr.findIndex(m => m.id === updated.id)
            if (idx !== -1) arr[idx] = updated
          }
        } catch (e) { console.error('Realtime UPDATE handler failed:', e.message || e) }
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'chat_messages' }, (payload) => {
        try {
          const old = payload.old
          Object.keys(messages.value).forEach(chId => {
            messages.value[chId] = messages.value[chId].filter(m => m.id !== old.id)
          })
        } catch (e) { console.error('Realtime DELETE handler failed:', e.message || e) }
      })
      .subscribe((status, err) => {
        if (realtimeSub !== ch) return // channel replaced — residual events ignored (anti-storm)
        if (status === 'SUBSCRIBED') {
          realtimeRetryCount = 0
          connected.value = true
          lastRealtimeError.value = null
          if (realtimeFailsafeTimer) { clearInterval(realtimeFailsafeTimer); realtimeFailsafeTimer = null }
          stopPolling()
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          connected.value = false
          lastRealtimeError.value = err ? String(err.message || err) : status
          if (err) console.error('Chat realtime — ' + status + ': ' + lastRealtimeError.value)
          scheduleRealtimeReconnect()
          startPolling()
        }
      })
  } catch (e) {
    console.error('Realtime subscription failed:', e.message || e)
    connected.value = false
    scheduleRealtimeReconnect()
    startPolling()
  }
}

function scheduleRealtimeReconnect() {
  if (realtimeGaveUp) return
  if (realtimeRetryTimer) return
  if (realtimeRetryCount >= MAX_REALTIME_RETRIES) {
    realtimeGaveUp = true
    console.error('Chat realtime — max retries reached, giving up (last: ' + (lastRealtimeError.value || 'unknown') + ')')
    connected.value = false
    if (realtimeSub) { try { realtimeSub.unsubscribe() } catch (_) {} realtimeSub = null }
    if (!realtimeGaveUpListener) {
      realtimeGaveUpListener = () => {
        if (document.visibilityState === 'visible') {
          document.removeEventListener('visibilitychange', realtimeGaveUpListener)
          realtimeGaveUpListener = null
          realtimeRetryCount = 0
          subscribeRealtime()
        }
      }
      document.addEventListener('visibilitychange', realtimeGaveUpListener)
    }
    if (!realtimeFailsafeTimer) {
      // Periodic catch-up: visibilitychange does not fire if the tab stays visible.
      realtimeFailsafeTimer = setInterval(() => {
        if (realtimeGaveUp) { realtimeRetryCount = 0; subscribeRealtime() }
      }, REALTIME_FAILSAFE_MS)
    }
    return
  }
  const delay = REALTIME_RECONNECT_DELAYS[Math.min(realtimeRetryCount, REALTIME_RECONNECT_DELAYS.length - 1)]
  realtimeRetryCount++
  console.warn('Chat realtime — reconnecting in ' + delay + 'ms (attempt ' + realtimeRetryCount + ')')
  realtimeRetryTimer = setTimeout(() => {
    realtimeRetryTimer = null
    subscribeRealtime()
  }, delay)
}

// ─── Fallback polling (realtime outage) ────────────────────────────────
// Only active if realtime is unavailable AND the chat surface is visible.
// Incremental (created_at > the channel's last message): empty response ~99 % of the
// time → negligible egress. Backoff 6→30 s on an inactive channel. Switches itself off
// when realtime comes back (SUBSCRIBED) or on destroy.
function startPolling() {
  if (pollTimer) return
  pollDelay = POLL_BASE_MS
  console.warn('Chat realtime — fallback polling actif (' + (POLL_BASE_MS / 1000) + 's)')
  pollTimer = setTimeout(pollCycle, pollDelay)
}

function stopPolling() {
  if (pollTimer) { clearTimeout(pollTimer); pollTimer = null }
  pollDelay = POLL_BASE_MS
}

async function pollCycle() {
  pollTimer = null
  if (connected.value) { stopPolling(); return }
  if (!pollBusy && surfaceVisible.value && document.visibilityState === 'visible' && activeChannel.value) {
    pollBusy = true
    try {
      const got = await pollOnce(activeChannel.value)
      pollDelay = got ? POLL_BASE_MS : Math.min(Math.round(pollDelay * 1.5), POLL_MAX_MS)
    } catch (_) {
      pollDelay = POLL_MAX_MS
    } finally {
      pollBusy = false
    }
  }
  if (!connected.value) pollTimer = setTimeout(pollCycle, pollDelay)
}

// Fetches messages newer than the last known one of the channel. true if there are new ones.
async function pollOnce(channelId) {
  const arr = messages.value[channelId]
  if (!arr || arr.length === 0) {
    await loadMessages(channelId)
    return (messages.value[channelId] || []).length > 0
  }
  const last = arr[arr.length - 1].timestamp
  if (!last) return false
  const { data, error } = await supabase
    .from('chat_messages')
    .select('*')
    .eq('channel_id', channelId)
    .gt('created_at', last)
    .order('created_at', { ascending: true })
    .limit(MESSAGES_PER_PAGE)
  if (error || !data || data.length === 0) return false
  let added = false
  for (const raw of data) {
    const msg = mapMsg(raw)
    if (!messages.value[channelId].some(m => m.id === msg.id)) {
      messages.value[channelId].push(msg)
      added = true
    }
  }
  return added
}

function destroy() {
  if (realtimeSub) { try { realtimeSub.unsubscribe() } catch (_) {} realtimeSub = null }
  if (realtimeRetryTimer) { clearTimeout(realtimeRetryTimer); realtimeRetryTimer = null }
  if (realtimeFailsafeTimer) { clearInterval(realtimeFailsafeTimer); realtimeFailsafeTimer = null }
  stopPolling()
  if (realtimeGaveUpListener) { document.removeEventListener('visibilitychange', realtimeGaveUpListener); realtimeGaveUpListener = null }
  connected.value = false
  realtimeRetryCount = 0
  realtimeGaveUp = false
}

// ─── Send with validation ─────────────────────────────────────────────────
async function sendMessage(channelId, content, author, authorId, attachments = []) {
  const trimmed = (content || '').trim()
  if (!trimmed) return
  if (trimmed.length > MAX_MESSAGE_LENGTH) {
    lastError.value = 'msg_too_long'
    return
  }
  const now = Date.now()
  if (now - lastSendTime < SEND_COOLDOWN_MS) return
  lastSendTime = now
  sending.value = true
  try {
    const auth = useAuthStore()
    const userId = authorId || auth.user?.id
    // G9-21: never a "user_default" — first name, otherwise the email prefix
    const name = author || auth.profile?.first_name || (auth.user?.email || '').split('@')[0] || ''
    // CR-9 (C-06): organization_id set at insert time — RLS only accepts
    // the caller's org value (IS NOT DISTINCT FROM get_my_org_id())
    const { error } = await withWrite(() => supabase.from('chat_messages').insert({
      channel_id: channelId, user_id: userId, author_name: name,
      content: trimmed, attachments: attachments.length ? attachments : [],
      reply_to: replyingTo.value || null,
      organization_id: auth.profile?.organization_id ?? null
    }), { label: 'chat.sendMessage' })
    if (error) {
      console.error('sendMessage — insert failed:', error.message)
      lastError.value = 'send_failed'
      return
    }
    replyingTo.value = null
    // Realtime outage: immediately reflect the sent message through the poll
    if (!connected.value) pollOnce(channelId).catch(() => {})
  } catch (e) {
    console.error('sendMessage — unexpected failure:', e.message || e)
    lastError.value = 'send_failed'
  } finally {
    sending.value = false
  }
}

async function editMessage(channelId, msgId, newContent) {
  const trimmed = (newContent || '').trim()
  if (!trimmed || trimmed.length > MAX_MESSAGE_LENGTH) return
  try {
    const { error } = await withWrite(() => supabase.from('chat_messages')
      .update({ content: trimmed, edited_at: new Date().toISOString() })
      .eq('id', msgId), { label: 'chat.editMessage' })
    if (error) {
      console.error('editMessage — update failed:', error.message)
      lastError.value = 'edit_failed'
    }
    editingMessage.value = null
  } catch (e) {
    console.error('editMessage — unexpected failure:', e.message || e)
    lastError.value = 'edit_failed'
  }
}

async function deleteMessage(channelId, msgId) {
  try {
    const { error } = await withWrite(() => supabase.from('chat_messages').delete().eq('id', msgId), { label: 'chat.deleteMessage' })
    if (error) {
      console.error('deleteMessage — delete failed:', error.message)
      lastError.value = 'delete_failed'
    }
  } catch (e) {
    console.error('deleteMessage — unexpected failure:', e.message || e)
    lastError.value = 'delete_failed'
  }
}

async function pinMessage(channelId, msgId) {
  try {
    const msg = (messages.value[channelId] || []).find(m => m.id === msgId)
    if (!msg) return
    const { error } = await withWrite(() => supabase.from('chat_messages')
      .update({ pinned: !msg.pinned })
      .eq('id', msgId), { label: 'chat.pinMessage' })
    if (error) {
      console.error('pinMessage — update failed:', error.message)
      lastError.value = 'edit_failed'
    }
  } catch (e) {
    console.error('pinMessage — unexpected failure:', e.message || e)
    lastError.value = 'edit_failed'
  }
}

async function addReaction(channelId, msgId, emoji, userId) {
  try {
    const auth = useAuthStore()
    const uid = userId || auth.user?.id
    const msg = (messages.value[channelId] || []).find(m => m.id === msgId)
    if (!msg) return
    let reactions = [...(msg.reactions || [])]
    const idx = reactions.findIndex(r => r.emoji === emoji)
    if (idx !== -1) {
      if (reactions[idx].users?.includes(uid)) {
        reactions[idx].users = reactions[idx].users.filter(u => u !== uid)
        if (reactions[idx].users.length === 0) reactions.splice(idx, 1)
      } else {
        reactions[idx].users = [...(reactions[idx].users || []), uid]
      }
    } else {
      reactions.push({ emoji, users: [uid] })
    }
    const { error } = await withWrite(() => supabase.from('chat_messages')
      .update({ reactions })
      .eq('id', msgId), { label: 'chat.addReaction' })
    if (error) {
      console.error('addReaction — update failed:', error.message)
      lastError.value = 'edit_failed'
    }
  } catch (e) {
    console.error('addReaction — unexpected failure:', e.message || e)
    lastError.value = 'edit_failed'
  }
}

function setReplyTo(channelId, msgId) {
  replyingTo.value = msgId || null
}

async function setActive(id) {
  activeChannel.value = id
  unreadCounts.value[id] = 0
  if (!messages.value[id]) {
    try {
      await loadMessages(id)
    } catch (e) {
      console.error('setActive — loadMessages failed:', e.message || e)
    }
  } else if (!connected.value) {
    // Realtime outage: catch up on what was missed on this channel
    pollOnce(id).catch(() => {})
  }
}

// ─── DM (DM contract 13/07, extensible foundation for groups) ───────────────
// Table chat_channel_members = participants; RPC open_dm = atomic find-or-create.
// A type='dm' channel is only visible (RLS) to its participants — realtime included.
const dmChannels = computed(() => channels.value.filter(c => c.type === 'dm'))
// channel_id → [user_id of the participants]
const dmMembersMap = ref({})

async function loadDmMembers() {
  const ids = channels.value.filter(c => c.type === 'dm').map(c => c.id)
  if (!ids.length) { dmMembersMap.value = {}; return }
  try {
    const { data, error } = await supabase.from('chat_channel_members')
      .select('channel_id, user_id').in('channel_id', ids)
    if (error) {
      console.error('loadDmMembers — query failed:', error.message)
      return
    }
    const map = {}
    for (const r of data || []) {
      if (!map[r.channel_id]) map[r.channel_id] = []
      map[r.channel_id].push(r.user_id)
    }
    dmMembersMap.value = map
  } catch (e) {
    console.error('loadDmMembers — unexpected failure:', e.message || e)
  }
}

function dmPartnerId(ch) {
  if (!ch || ch.type !== 'dm') return null
  const me = useAuthStore().user?.id
  const members = dmMembersMap.value[ch.id] || []
  return members.find(u => u !== me) || null
}

function dmChannelFor(userId) {
  if (!userId) return null
  return channels.value.find(c => c.type === 'dm' && (dmMembersMap.value[c.id] || []).includes(userId)) || null
}

function channelLabel(ch) {
  if (!ch) return ''
  if (ch.type === 'dm') return memberNames.value[dmPartnerId(ch)] || 'DM'
  return ch.name
}

async function openDm(userId) {
  const me = useAuthStore().user?.id
  if (!me || !userId || userId === me) return
  const existing = dmChannelFor(userId)
  if (existing) { await setActive(existing.id); return }
  try {
    const { data, error } = await withWrite(() => supabase.rpc('open_dm', { other_user: userId }), { label: 'chat.openDm' })
    if (error || !data) {
      console.error('openDm — rpc failed:', error?.message || 'no channel id')
      lastError.value = 'open_dm_failed'
      return
    }
    await loadChannels()
    await setActive(data)
  } catch (e) {
    console.error('openDm — unexpected failure:', e.message || e)
    lastError.value = 'open_dm_failed'
  }
}

async function createChannel(name, description = '') {
  const trimmed = (name || '').trim()
  if (!trimmed) return
  try {
    const auth = useAuthStore()
    // CR-9 (C-06): channel attached to the creator's organization
    const { error } = await withWrite(() => supabase.from('chat_channels').insert({
      name: trimmed, description: description.trim(), type: 'channel',
      created_by: auth.user?.id,
      organization_id: auth.profile?.organization_id ?? null
    }), { label: 'chat.createChannel' })
    if (error) {
      console.error('createChannel — insert failed:', error.message)
      lastError.value = 'create_channel_failed'
      return
    }
    await loadChannels()
  } catch (e) {
    console.error('createChannel — unexpected failure:', e.message || e)
    lastError.value = 'create_channel_failed'
  }
}

async function updateChannel(id, changes) {
  try {
    const { error } = await withWrite(() => supabase.from('chat_channels').update(changes).eq('id', id), { label: 'chat.updateChannel' })
    if (error) {
      console.error('updateChannel — update failed:', error.message)
      lastError.value = 'edit_failed'
      return
    }
    await loadChannels()
  } catch (e) {
    console.error('updateChannel — unexpected failure:', e.message || e)
    lastError.value = 'edit_failed'
  }
}

async function deleteChannel(id) {
  try {
    const { error } = await withWrite(() => supabase.from('chat_channels').delete().eq('id', id), { label: 'chat.deleteChannel' })
    if (error) {
      console.error('deleteChannel — delete failed:', error.message)
      lastError.value = 'delete_failed'
      return
    }
    if (activeChannel.value === id) activeChannel.value = null
    await loadChannels()
  } catch (e) {
    console.error('deleteChannel — unexpected failure:', e.message || e)
    lastError.value = 'delete_failed'
  }
}

function clearError() { lastError.value = null }

// G9-20: called by the surface (panel/page) on mount/unmount — no destroy on close
function setSurfaceVisible(v) {
  surfaceVisible.value = !!v
  if (v && activeChannel.value) unreadCounts.value[activeChannel.value] = 0
  if (v && !connected.value && activeChannel.value) {
    pollDelay = POLL_BASE_MS
    pollOnce(activeChannel.value).catch(() => {})
  }
}

// ─── GDPR Art. 17 — Right to erasure ─────────────────────────────
async function deleteUserChatData(userId) {
  if (!userId) return
  try {
    const { error: anonErr } = await withWrite(() => supabase.from('chat_messages')
      .update({ author_name: '[deleted]', content: '[Message deleted — GDPR request]', attachments: [], reactions: [] })
      .eq('user_id', userId), { label: 'chat.gdprErase' })
    if (anonErr) {
      console.error('RGPD deleteUserChatData — anonymisation failed:', anonErr.message)
      lastError.value = 'delete_failed'
      return false
    }
    if (activeChannel.value) await loadMessages(activeChannel.value)
    return true
  } catch (e) {
    console.error('RGPD deleteUserChatData — unexpected failure:', e.message || e)
    lastError.value = 'delete_failed'
    return false
  }
}

return {
  channels, messages, activeChannel, unreadCounts, totalUnread,
  activeMessages, pinnedMessages, editingMessage, replyingTo,
  channelsLoading, messagesLoading, sending, lastError, lastRealtimeError, connected,
  surfaceVisible, memberNames, authorLabel, loadMemberNames, setSurfaceVisible,
  init, sendMessage, editMessage, deleteMessage, pinMessage,
  addReaction, setReplyTo, setActive, loadOlderMessages,
  dmChannels, dmMembersMap, dmPartnerId, dmChannelFor, openDm, channelLabel,
  createChannel, updateChannel, deleteChannel, clearError, deleteUserChatData, destroy
}
})

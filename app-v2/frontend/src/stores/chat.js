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
// CHAT-LIVE (09/09/2026): three cadences, not one. POLL_LIVE_MS is a safety-net sweep that
// runs EVEN WHILE realtime reports itself connected - a websocket that is up but delivering
// nothing (RLS refusing the row, publication dropped, tenant throttled) is indistinguishable
// from a healthy one on the client side, and that is exactly what "the message is not seen
// in real-time" was: connected.value === true and not one event ever arriving.
// POLL_BASE/POLL_MAX are the degraded mode used once realtime is known to be down.
const POLL_LIVE_MS = 15000
const POLL_BASE_MS = 4000
const POLL_MAX_MS = 30000
// One sweep covers EVERY channel at once - RLS already scopes the rows to my org and my DMs.
// The old poll only ever looked at the active channel, so an unread badge could never grow
// for any other channel. Never an .in('channel_id', [...]) here: that list grows unbounded (R6).
const POLL_SWEEP_LIMIT = 200
// Overlap re-read: two rows can share a created_at, and .gt() would drop one of them.
// We re-ask for the last second every time and let the id dedupe absorb the overlap.
const POLL_OVERLAP_MS = 1000
// Degraded mode only: reactions and edits move `edited_at`, not `created_at`, so the
// watermark sweep cannot see them. Re-read the open channel at this cadence instead.
const DEGRADED_REFRESH_MS = 15000

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
let pollActive = false
// CHAT-LIVE: high-water mark = the newest created_at this client has ever ingested, across
// ALL channels. The sweep asks for "everything after this", so a channel that was never
// opened still feeds its badge.
let lastSeenAt = null
let lastDegradedRefresh = 0
let lastSendTime = 0
let realtimeGaveUpListener = null
// CHAT-LIVE: coming back to the tab sweeps at once instead of waiting out the cadence.
let pollVisibilityListener = null
// Anti-storm guard: once the abandon is recorded, residual CLOSED events
// (including the one triggered by our own unsubscribe) are no longer logged.
let realtimeGaveUp = false

const activeMessages = computed(() => activeChannel.value ? (messages.value[activeChannel.value] || []) : [])
const pinnedMessages = computed(() => activeMessages.value.filter(m => m.pinned))
const totalUnread = computed(() => Object.values(unreadCounts.value).reduce((a, b) => a + b, 0))
// CHAT-BADGE (09/09/2026): one source for the badge text (R3) - the FAB and every sidebar
// row must cap the same way, or a 3-digit count blows the 16px circle out of shape.
// Not i18n: it is a number, and "9+" reads identically in fr/en/ko.
function unreadBadge(n) {
  const v = Number(n) || 0
  if (v <= 0) return ''
  return v > 9 ? '9+' : String(v)
}

// ─── Init ──────────────────────────────────────────────────────────────────
async function init() {
  try {
    await loadChannels()
    loadMemberNames()
    if (channels.value.length > 0 && !activeChannel.value) {
      activeChannel.value = channels.value[0].id
    }
    if (activeChannel.value) await loadMessages(activeChannel.value)
    // CHAT-LIVE: nothing has ever been ingested (empty org, or every channel empty) - start
    // the watermark slightly in the past rather than at "now": a client clock running ahead
    // of Postgres would otherwise skip the next minute of messages outright.
    if (!lastSeenAt) lastSeenAt = new Date(Date.now() - 60000).toISOString()
    pollActive = true
    if (!pollVisibilityListener && typeof document !== 'undefined') {
      pollVisibilityListener = () => { if (document.visibilityState === 'visible') pollNow() }
      document.addEventListener('visibilitychange', pollVisibilityListener)
    }
    subscribeRealtime()
    // Armed BEFORE realtime confirms: if the socket never delivers, the sweep still does.
    startPolling()
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
      for (const m of mapped) {
        if (m.timestamp && (!lastSeenAt || m.timestamp > lastSeenAt)) lastSeenAt = m.timestamp
      }
      if (before && messages.value[channelId]) {
        messages.value[channelId] = [...mapped, ...messages.value[channelId]]
      } else {
        // CHAT-LIVE: a message still in flight (optimistic echo) survives the reload.
        // Dropping it made the sender's own line vanish for a second on every refresh.
        const pending = (messages.value[channelId] || []).filter(m => m.pending)
        messages.value[channelId] = pending.length ? [...mapped, ...pending] : mapped
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
    edited: !!m.edited_at,
    pending: false
  }
}

// CHAT-LIVE (09/09/2026): the ONE door every incoming message goes through - realtime INSERT,
// poll sweep, and the confirmed row our own insert returns. Deduplicated by id, so realtime
// and the safety-net sweep delivering the same row is a no-op, not a double bubble.
// Returns how many rows were genuinely new.
function ingest(rows, { silent = false } = {}) {
  const meId = useAuthStore().user?.id
  let added = 0
  let unknownChannel = false
  for (const raw of rows || []) {
    const msg = mapMsg(raw)
    if (msg.timestamp && (!lastSeenAt || msg.timestamp > lastSeenAt)) lastSeenAt = msg.timestamp
    if (!messages.value[msg.channelId]) messages.value[msg.channelId] = []
    const arr = messages.value[msg.channelId]
    const known = arr.findIndex(m => m.id === msg.id)
    if (known !== -1) { arr[known] = msg; continue }
    // The optimistic echo of MY message, now confirmed: replace it in place. Appending
    // instead showed the sender their own message twice until the next reload.
    const pending = arr.findIndex(m => m.pending && m.authorId === msg.authorId && m.content === msg.content)
    if (pending !== -1) { arr[pending] = msg; continue }
    insertByTime(arr, msg)
    added++
    // D-14/R21: my own message is never "unread". Counting it made the badge lie the moment
    // I sent something with the panel closed.
    if (!silent && msg.authorId !== meId && (!surfaceVisible.value || msg.channelId !== activeChannel.value)) {
      unreadCounts.value[msg.channelId] = (unreadCounts.value[msg.channelId] || 0) + 1
    }
    // G9-22: channel created after boot => unknown to the list. One reload after the batch,
    // never one per row (a 200-row sweep used to fire 200 loadChannels()).
    if (!channels.value.some(c => c.id === msg.channelId)) unknownChannel = true
  }
  if (unknownChannel) loadChannels()
  return added
}

// A sweep after a reconnect can deliver rows older than what is already on screen, so the
// append fast-path is not enough on its own.
function insertByTime(arr, msg) {
  const last = arr[arr.length - 1]
  if (!last || !msg.timestamp || (last.timestamp || '') <= msg.timestamp) { arr.push(msg); return }
  let i = arr.length - 1
  while (i > 0 && (arr[i - 1].timestamp || '') > msg.timestamp) i--
  arr.splice(i, 0, msg)
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
        // G9-20 unread + G9-22 unknown channel now live in ingest(), shared with the sweep.
        try { ingest([payload.new]) }
        catch (e) { console.error('Realtime INSERT handler failed:', e.message || e) }
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'chat_messages' }, (payload) => {
        // silent: an edit or a reaction is not a new message - it must not move the badge.
        try { ingest([payload.new], { silent: true }) }
        catch (e) { console.error('Realtime UPDATE handler failed:', e.message || e) }
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
          // CHAT-LIVE: do NOT stop polling here. This used to be stopPolling(), which is why a
          // socket that reported SUBSCRIBED and then delivered nothing left the chat frozen with
          // no fallback and no visible error. It merely slows down to POLL_LIVE_MS.
          startPolling()
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          connected.value = false
          lastRealtimeError.value = err ? String(err.message || err) : status
          if (err) console.error('Chat realtime — ' + status + ': ' + lastRealtimeError.value)
          scheduleRealtimeReconnect()
          pollDelay = POLL_BASE_MS
          pollNow()
        }
      })
  } catch (e) {
    console.error('Realtime subscription failed:', e.message || e)
    connected.value = false
    scheduleRealtimeReconnect()
    pollDelay = POLL_BASE_MS
    pollNow()
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

// ─── Safety-net polling ────────────────────────────────────────────────────
// CHAT-LIVE (09/09/2026): this used to be a *fallback*, armed only once realtime had
// reported an error, and it only ever looked at the active channel while the panel was open.
// Two consequences, both reported as "the chat is not real-time":
//   - a socket stuck in SUBSCRIBED but delivering nothing had NO fallback at all, and
//     connected.value stayed true, so not even the disconnected banner showed;
//   - an unread badge could never grow for a channel other than the displayed one.
// It is now always armed while the store is alive, at POLL_LIVE_MS when realtime looks
// healthy and POLL_BASE..POLL_MAX when it does not. One request per sweep, incremental on a
// created_at watermark, so the usual answer is an empty array: negligible egress.
function startPolling() {
  if (!pollActive || pollTimer) return
  pollTimer = setTimeout(pollCycle, connected.value ? POLL_LIVE_MS : pollDelay)
}

// Cancels whatever long timer is pending and sweeps on the next tick. Used when the state
// changed under us (realtime dropped, the surface opened, a channel was selected): waiting
// out a 15 s timer there is exactly the lag the user sees.
function pollNow() {
  if (!pollActive) return
  if (pollTimer) { clearTimeout(pollTimer); pollTimer = null }
  pollTimer = setTimeout(pollCycle, 0)
}

function stopPolling() {
  if (pollTimer) { clearTimeout(pollTimer); pollTimer = null }
  pollDelay = POLL_BASE_MS
}

async function pollCycle() {
  pollTimer = null
  if (!pollActive) return
  // A hidden tab is not polled. The timer keeps ticking so the loop survives, and the
  // visibilitychange listener below sweeps the instant the tab is looked at again.
  const tabVisible = typeof document === 'undefined' || document.visibilityState === 'visible'
  if (!pollBusy && tabVisible) {
    pollBusy = true
    try {
      const got = await pollSweep()
      pollDelay = got ? POLL_BASE_MS : Math.min(Math.round(pollDelay * 1.5), POLL_MAX_MS)
      await degradedRefresh()
    } catch (_) {
      pollDelay = POLL_MAX_MS
    } finally {
      pollBusy = false
    }
  }
  startPolling()
}

// Every message newer than the watermark, all channels at once. RLS does the scoping.
async function pollSweep() {
  if (!lastSeenAt) return 0
  const since = new Date(Date.parse(lastSeenAt) - POLL_OVERLAP_MS).toISOString()
  const { data, error } = await supabase
    .from('chat_messages')
    .select('*')
    .gt('created_at', since)
    .order('created_at', { ascending: true })
    .limit(POLL_SWEEP_LIMIT)
  if (error) {
    console.warn('Chat poll sweep failed:', error.message)
    return 0
  }
  if (!data || data.length === 0) return 0
  return ingest(data)
}

// Realtime down + panel open: reactions, edits and pins move edited_at, never created_at,
// so the watermark sweep is blind to them. Re-read the open channel, but no faster than
// DEGRADED_REFRESH_MS - this is a full page of 100 rows, not an incremental read.
async function degradedRefresh() {
  if (connected.value || !surfaceVisible.value || !activeChannel.value) return
  const now = Date.now()
  if (now - lastDegradedRefresh < DEGRADED_REFRESH_MS) return
  lastDegradedRefresh = now
  await loadMessages(activeChannel.value)
}

function destroy() {
  if (realtimeSub) { try { realtimeSub.unsubscribe() } catch (_) {} realtimeSub = null }
  if (realtimeRetryTimer) { clearTimeout(realtimeRetryTimer); realtimeRetryTimer = null }
  if (realtimeFailsafeTimer) { clearInterval(realtimeFailsafeTimer); realtimeFailsafeTimer = null }
  stopPolling()
  if (realtimeGaveUpListener) { document.removeEventListener('visibilitychange', realtimeGaveUpListener); realtimeGaveUpListener = null }
  if (pollVisibilityListener) { document.removeEventListener('visibilitychange', pollVisibilityListener); pollVisibilityListener = null }
  connected.value = false
  realtimeRetryCount = 0
  realtimeGaveUp = false
  pollActive = false
  lastSeenAt = null
  lastDegradedRefresh = 0
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
  let tempId = null // declared out here so the catch below can revert the echo too
  try {
    const auth = useAuthStore()
    const userId = authorId || auth.user?.id
    // G9-21: never a "user_default" — first name, otherwise the email prefix
    const name = author || auth.profile?.first_name || (auth.user?.email || '').split('@')[0] || ''
    // CR-9 (C-06): organization_id set at insert time — RLS only accepts
    // the caller's org value (IS NOT DISTINCT FROM get_my_org_id())
    // CHAT-LIVE: the sender used to see NOTHING until a realtime INSERT came back for their
    // own message. With the socket silently dead that is a chat that swallows what you type.
    // The bubble now appears at once, marked pending, and is replaced by the confirmed row.
    tempId = 'pending-' + now + '-' + Math.random().toString(36).slice(2)
    const echo = {
      id: tempId, channelId, author: name, authorId: userId, content: trimmed,
      timestamp: new Date().toISOString(), pinned: false, reactions: [],
      attachments: attachments.length ? attachments : [], replyTo: replyingTo.value || null,
      editedAt: null, edited: false, pending: true
    }
    echo.date = echo.timestamp.slice(0, 10)
    if (!messages.value[channelId]) messages.value[channelId] = []
    messages.value[channelId].push(echo)

    // D-14: .select() so the CONFIRMED row is what lands on screen - the echo is never
    // promoted on its own. A failed insert takes its echo away with it (structural
    // optimistic update, reverted on failure).
    const { data, error } = await withWrite(() => supabase.from('chat_messages').insert({
      channel_id: channelId, user_id: userId, author_name: name,
      content: trimmed, attachments: attachments.length ? attachments : [],
      reply_to: replyingTo.value || null,
      organization_id: auth.profile?.organization_id ?? null
    }).select().single(), { label: 'chat.sendMessage' })
    if (error) {
      messages.value[channelId] = messages.value[channelId].filter(m => m.id !== tempId)
      console.error('sendMessage — insert failed:', error.message)
      lastError.value = 'send_failed'
      return
    }
    replyingTo.value = null
    // silent: my own message must not increment my own badge.
    if (data) ingest([data], { silent: true })
    else messages.value[channelId] = messages.value[channelId].filter(m => m.id !== tempId)
  } catch (e) {
    if (tempId && messages.value[channelId]) {
      messages.value[channelId] = messages.value[channelId].filter(m => m.id !== tempId)
    }
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

// CHAT-REACT: same false success as the reaction - pinning someone else's message was a
// silent no-op against chat_messages_update. Through the RPC, org-scoped and confirmed.
async function pinMessage(channelId, msgId) {
  try {
    const msg = (messages.value[channelId] || []).find(m => m.id === msgId)
    if (!msg || msg.pending) return
    const { data, error } = await withWrite(
      () => supabase.rpc('set_chat_message_pinned', { p_message_id: msgId, p_pinned: !msg.pinned }),
      { label: 'chat.pinMessage' }
    )
    if (error) {
      console.error('pinMessage — rpc failed:', error.message)
      lastError.value = 'pin_failed'
      return
    }
    const arr = messages.value[channelId] || []
    const idx = arr.findIndex(m => m.id === msgId)
    if (idx !== -1) arr[idx] = { ...arr[idx], pinned: data === true }
  } catch (e) {
    console.error('pinMessage — unexpected failure:', e.message || e)
    lastError.value = 'pin_failed'
  }
}

// CHAT-REACT (09/09/2026): through the toggle_chat_reaction RPC, never a direct UPDATE.
// chat_messages_update is USING (user_id = auth.uid()), so the old read-modify-write UPDATE
// matched ZERO rows on anybody else's message and PostgREST answered 204 with error = null -
// a textbook false success (D-14): the reaction never appeared and nothing was ever shown.
// The RPC also does the read-modify-write under a row lock, so two people reacting at the
// same instant no longer overwrite each other. Migration 20260909120000_chat_reactions_rpc.sql.
async function addReaction(channelId, msgId, emoji) {
  try {
    const msg = (messages.value[channelId] || []).find(m => m.id === msgId)
    if (!msg) return
    if (msg.pending) return // not written yet - it has no server id to react to
    const { data, error } = await withWrite(
      () => supabase.rpc('toggle_chat_reaction', { p_message_id: msgId, p_emoji: emoji }),
      { label: 'chat.addReaction' }
    )
    if (error) {
      console.error('addReaction — rpc failed:', error.message)
      lastError.value = 'react_failed'
      return
    }
    // The confirmed array from the server, never the locally guessed one (D-14).
    const arr = messages.value[channelId] || []
    const idx = arr.findIndex(m => m.id === msgId)
    if (idx !== -1) arr[idx] = { ...arr[idx], reactions: Array.isArray(data) ? data : [] }
  } catch (e) {
    console.error('addReaction — unexpected failure:', e.message || e)
    lastError.value = 'react_failed'
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
  } else {
    // CHAT-LIVE: catch up immediately on switching, whatever realtime claims about itself.
    lastDegradedRefresh = 0
    pollNow()
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
  if (v && activeChannel.value) {
    pollDelay = POLL_BASE_MS
    lastDegradedRefresh = 0
    pollNow()
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
  channels, messages, activeChannel, unreadCounts, totalUnread, unreadBadge,
  activeMessages, pinnedMessages, editingMessage, replyingTo,
  channelsLoading, messagesLoading, sending, lastError, lastRealtimeError, connected,
  surfaceVisible, memberNames, authorLabel, loadMemberNames, setSurfaceVisible,
  init, sendMessage, editMessage, deleteMessage, pinMessage,
  addReaction, setReplyTo, setActive, loadOlderMessages,
  dmChannels, dmMembersMap, dmPartnerId, dmChannelFor, openDm, channelLabel,
  createChannel, updateChannel, deleteChannel, clearError, deleteUserChatData, destroy
}
})

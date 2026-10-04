<template>
  <div class="chat_panel_messages_wrapper">
    <div v-if="!store.connected" class="chat_panel_banner_disconnected">
      {{ t('chat_disconnected') }}
    </div>

    <div v-if="activeChannel" class="chat_panel_messages_header">
      <!-- CHAT-MOBILE (03/10/2026): on a phone the panel shows the channel list OR the
           messages (ChatPanel); this is the way back to the list. Hidden above 768px. -->
      <button class="chat_panel_button_ghost chat_panel_back_mobile" :title="t('back')" @click="$emit('back')">←</button>
      <div class="chat_panel_messages_header_left">
        <span class="chat_panel_messages_header_name">{{ activeChannel.type === 'dm' ? store.channelLabel(activeChannel) : '# ' + activeChannel.name }}</span>
        <span v-if="activeChannel.description" class="chat_panel_messages_header_description">{{ activeChannel.description }}</span>
      </div>
      <div class="chat_panel_messages_header_actions">
        <button class="chat_panel_button_ghost" @click="showSearch = !showSearch" :title="t('chat_search_msg')">🔍</button>
        <button class="chat_panel_button_ghost" @click="showPinned = !showPinned">📌</button>
        <button v-if="canManageChannel && activeChannel.type !== 'dm'" class="chat_panel_button_ghost" @click="$emit('rename-channel', activeChannel)">✏️</button>
      </div>
    </div>

    <div v-if="showSearch" class="chat_panel_search_bar">
      <input v-model="searchQuery" :placeholder="t('chat_search_msg')" class="chat_panel_search_input" />
    </div>

    <!-- CHAT-TOUCH: a tap on the empty background closes an open action bar. -->
    <div class="chat_panel_messages_body" ref="messagesRef" @click="closeToolbar()">
      <button v-if="store.activeMessages.length >= 100" class="chat_panel_load_more" @click="store.loadOlderMessages(store.activeChannel)">
        {{ t('chat_load_more') }}
      </button>

      <div v-if="store.messagesLoading" class="chat_panel_messages_empty">{{ t('chat_loading') }}</div>
      <div v-else-if="filteredMessages.length === 0" class="chat_panel_messages_empty">{{ t('chat_no_messages') }}</div>

      <template v-for="(group, date) in groupedMessages" :key="date">
        <div class="chat_panel_date_divider">
          <span>{{ formatDate(date) }}</span>
        </div>
        <!-- CHAT-TOUCH (09/09/2026): the action bar used to be display:none + :hover only,
             so on a phone it could NEVER be opened - no reaction, no reply, no delete on
             touch at all. A tap on the bubble now toggles it; hover still opens it on a
             mouse. .stop is deliberate: a tap on a button inside the bar must not re-toggle
             the bar it lives in. -->
        <div
          v-for="msg in group"
          :key="msg.id"
          class="chat_panel_message"
          :class="{
            'chat_panel_message_own': msg.authorId === currentUserId,
            'chat_panel_message_pinned': msg.pinned,
            'chat_panel_message_pending': msg.pending,
            'chat_panel_message_open': openToolbarId === msg.id,
            'chat_panel_message_editing': store.editingMessage?.id === msg.id
          }"
          @click.stop="toggleToolbar(msg)"
        >
          <div class="chat_panel_message_avatar" :style="{ background: hashColor(msg.authorId) }">
            {{ store.authorLabel(msg)?.charAt(0) || '?' }}
          </div>
          <div class="chat_panel_message_body">
            <div class="chat_panel_message_meta">
              <span class="chat_panel_message_author">{{ store.authorLabel(msg) }}</span>
              <span class="chat_panel_message_time">{{ formatMsgTime(msg.timestamp) }}</span>
              <span v-if="msg.edited" class="chat_panel_message_badge">{{ t('chat_edited') }}</span>
              <span v-if="msg.pinned" class="chat_panel_message_badge chat_panel_message_badge_pin">{{ t('chat_pinned') }}</span>
            </div>
            <div v-if="msg.replyTo" class="chat_panel_message_reply_indicator">
              ↩ {{ replyPreview(msg.replyTo) }}
            </div>
            <div v-if="msg.content" class="chat_panel_message_content" v-html="formatChatText(msg.content)"></div>
            <!-- CHAT-SHARE (03/10/2026): a shared client or task is a reference, not text. The
                 name shown is the live one when the record still exists (a rename follows), the
                 name at share time otherwise. A client opens its record, a task the Kanban. -->
            <div v-if="sharedRefs(msg).length" class="chat_panel_message_shares">
              <button
                v-for="s in sharedRefs(msg)"
                :key="s.type + s.id"
                class="chat_panel_message_share"
                :class="{ missing: s.missing }"
                @click.stop="openShare(s)"
              >{{ SHARE_ICONS[s.type] }} {{ s.name }}</button>
            </div>
            <div v-if="msg.reactions && msg.reactions.length" class="chat_panel_message_reactions">
              <span
                v-for="(r, ri) in msg.reactions"
                :key="ri"
                class="chat_panel_reaction"
                :class="{ mine: r.users && r.users.includes(currentUserId) }"
                @click.stop="store.addReaction(store.activeChannel, msg.id, r.emoji)"
              >{{ r.emoji }} {{ r.users?.length || 0 }}</span>
            </div>
          </div>
          <div v-if="!isViewer && !msg.pending" class="chat_panel_message_toolbar">
            <button
              v-for="e in quickReactions"
              :key="e"
              class="chat_panel_button_ghost"
              @click.stop="react(msg, e)"
            >{{ e }}</button>
            <button class="chat_panel_button_ghost" :title="t('chat_reply')" @click.stop="reply(msg)">↩</button>
            <button class="chat_panel_button_ghost" :title="t('chat_pinned')" @click.stop="pin(msg)">📌</button>
            <!-- CHAT-TASK (03/10/2026): the only way into the "create a task" slide-over.
                 ChatPanel had the slide-over and listened for create-task, but nothing ever
                 emitted it - the feature existed in the code and nowhere on screen. -->
            <button class="chat_panel_button_ghost" :title="t('chat_create_task')" @click.stop="createTask(msg)">⚡</button>
            <button v-if="msg.authorId === currentUserId" class="chat_panel_button_ghost" :title="t('edit')" @click.stop="startEdit(msg)">✏️</button>
            <button v-if="msg.authorId === currentUserId" class="chat_panel_button_ghost" :title="t('delete')" @click.stop="remove(msg)">🗑️</button>
          </div>
        </div>
      </template>
    </div>

    <div v-if="showPinned && store.pinnedMessages.length" class="chat_panel_pinned_panel">
      <div class="chat_panel_pinned_header">📌 {{ t('chat_pinned') }} ({{ store.pinnedMessages.length }})</div>
      <div v-for="pm in store.pinnedMessages" :key="pm.id" class="chat_panel_pinned_item">
        <strong>{{ store.authorLabel(pm) }}</strong>: {{ pm.content.slice(0, 80) }}
      </div>
    </div>

    <!-- CHAT-DELETE (03/10/2026): 🗑️ deleted on the spot, for everyone, with no way back - one
         stray tap on a phone (CHAT-TOUCH puts the bar right under the thumb) was enough.
         NOT teleported: the floating panel is z-index 999, a body-level dialog (z-index 60)
         would open behind it. -->
    <ConfirmDialog
      v-if="pendingDelete"
      :title="t('chat_delete_confirm_title')"
      :body="t('chat_delete_confirm_body')"
      :cta="t('cf_delete')"
      :busy="deleting"
      @confirm="confirmDelete"
      @cancel="pendingDelete = null"
    />
  </div>
</template>

<script setup>
import { ref, computed, watch, nextTick } from 'vue'
import { useI18n } from 'vue-i18n'
import { useChatStore } from '@/stores/chat'
import { useAuthStore } from '@/stores/auth'
import { useRouter } from 'vue-router'
import { useClientStore } from '@/stores/clients'
import { useTaskStore } from '@/stores/tasks'
import { useClientModalStore } from '@/stores/clientModal'
import { useQuoteStore } from '@/stores/quotes'
import { SHARE_ICONS } from './chatShares'
import { formatChatText } from '@/utils/sanitize'
import ConfirmDialog from '@/components/ConfirmDialog.vue'

const emit = defineEmits(['rename-channel', 'create-task', 'back'])

const { t, locale } = useI18n()
const store = useChatStore()
const authStore = useAuthStore()
const router = useRouter()
const clientsStore = useClientStore()
const tasksStore = useTaskStore()
const clientModal = useClientModalStore()
const quotesStore = useQuoteStore()

const messagesRef = ref(null)
const showSearch = ref(false)
const showPinned = ref(false)
const searchQuery = ref('')
// CHAT-TOUCH: id of the message whose action bar is open, or null. One at a time.
const openToolbarId = ref(null)
const quickReactions = ['👍', '❤️', '🎉', '✅']
// CHAT-DELETE: the message awaiting confirmation, and the write in flight.
const pendingDelete = ref(null)
const deleting = ref(false)

const currentUserId = computed(() => authStore.user?.id)
const isViewer = computed(() => authStore.profile?.org_role === 'viewer')
const activeChannel = computed(() => store.channels.find(c => c.id === store.activeChannel) || null)
const canManageChannel = computed(() => {
  const role = authStore.profile?.org_role
  return role === 'owner' || role === 'admin'
})

const filteredMessages = computed(() => {
  const msgs = store.activeMessages || []
  if (!searchQuery.value) return msgs
  const q = searchQuery.value.toLowerCase()
  return msgs.filter(m => m.content.toLowerCase().includes(q) || store.authorLabel(m).toLowerCase().includes(q))
})

const groupedMessages = computed(() => {
  const groups = {}
  for (const msg of filteredMessages.value) {
    const key = msg.date || 'unknown'
    if (!groups[key]) groups[key] = []
    groups[key].push(msg)
  }
  return groups
})

function formatDate(dateStr) {
  if (!dateStr || dateStr === 'unknown') return ''
  const d = new Date(dateStr + 'T00:00:00')
  const now = new Date()
  const today = now.toISOString().slice(0, 10)
  const yesterday = new Date(now.getTime() - 86400000).toISOString().slice(0, 10)
  if (dateStr === today) return t('today')
  if (dateStr === yesterday) return t('chat_yesterday')
  try {
    return new Intl.DateTimeFormat(locale.value, { day: 'numeric', month: 'long' }).format(d)
  } catch { return dateStr }
}

function replyPreview(replyToId) {
  const msg = store.activeMessages.find(m => m.id === replyToId)
  if (!msg) return t('chat_reply')
  return store.authorLabel(msg) + ': ' + msg.content.slice(0, 60)
}

// C7: time formatted with the app locale (time zone = device)
function formatMsgTime(ts) {
  if (!ts) return ''
  try {
    return new Intl.DateTimeFormat(locale.value, { hour: '2-digit', minute: '2-digit' }).format(new Date(ts))
  } catch { return '' }
}

function hashColor(id) {
  if (!id) return 'var(--text-muted)'
  const colors = ['var(--purple)', 'var(--green)', 'var(--blue)', 'var(--amber)', 'var(--red)']
  let hash = 0
  for (let i = 0; i < id.length; i++) hash = id.charCodeAt(i) + ((hash << 5) - hash)
  return colors[Math.abs(hash) % colors.length]
}

// CHAT-TOUCH: a tap on the bubble opens the bar; a second tap closes it. Selecting text
// must NOT toggle it, otherwise copying a message is impossible on a phone.
function toggleToolbar(msg) {
  if (isViewer.value || msg.pending) return
  const sel = typeof window !== 'undefined' && window.getSelection ? window.getSelection() : null
  if (sel && !sel.isCollapsed) return
  openToolbarId.value = openToolbarId.value === msg.id ? null : msg.id
}

function closeToolbar() { openToolbarId.value = null }

function react(msg, emoji) {
  store.addReaction(store.activeChannel, msg.id, emoji)
  closeToolbar()
}

function reply(msg) {
  store.setReplyTo(store.activeChannel, msg.id)
  closeToolbar()
}

function pin(msg) {
  store.pinMessage(store.activeChannel, msg.id)
  closeToolbar()
}

function remove(msg) {
  pendingDelete.value = msg
  closeToolbar()
}

// D-14: the dialog closes on the store's answer, not before. A failure also closes it - the
// message stays on screen and the panel's error banner (chat_err_delete_failed) says why.
async function confirmDelete() {
  const msg = pendingDelete.value
  if (!msg || deleting.value) return
  deleting.value = true
  try {
    await store.deleteMessage(msg.channelId || store.activeChannel, msg.id)
  } finally {
    deleting.value = false
    pendingDelete.value = null
  }
}

function startEdit(msg) {
  store.startEdit(store.activeChannel, msg.id)
  closeToolbar()
}

// CHAT-SHARE: only the reference types the composer writes; anything else is ignored. A quote
// the Quotes screen has not loaded yet is not "missing" - it is shown with its shared name.
function sharedRefs(msg) {
  return (msg.attachments || [])
    .filter(a => a && a.id && SHARE_ICONS[a.type])
    .map(a => {
      let live = null
      if (a.type === 'client') live = (clientsStore.clients || []).find(c => c.id === a.id)
      else if (a.type === 'task') live = (tasksStore.tasks || []).find(tk => tk.id === a.id)
      else live = (quotesStore.quotes || []).find(q => q.id === a.id)
      const liveName = a.type === 'client' ? live?.name : live?.title
      const known = a.type !== 'quote' || (quotesStore.quotes || []).length > 0
      return { type: a.type, id: a.id, name: liveName || a.name || '—', missing: known && !live }
    })
}

function openShare(share) {
  if (share.type === 'client') clientModal.open(share.id)
  else if (share.type === 'task') router.push({ name: 'tasks-kanban' })
  else router.push({ name: 'quotes' })
}

function createTask(msg) {
  emit('create-task', msg)
  closeToolbar()
}

function scrollToBottom() {
  if (messagesRef.value) messagesRef.value.scrollTop = messagesRef.value.scrollHeight
}

watch(() => store.activeMessages.length, () => { nextTick(() => scrollToBottom()) })
// Switching channel must not leave an orphan action bar attached to a gone message.
watch(() => store.activeChannel, () => { closeToolbar(); pendingDelete.value = null })
</script>

<style scoped>
.chat_panel_messages_wrapper { flex: 1; display: flex; flex-direction: column; min-height: 0; }
.chat_panel_banner_disconnected { padding: 6px 14px; background: rgba(239,68,68,0.08); color: var(--red); font-size: 12px; text-align: center; }
.chat_panel_messages_header { display: flex; align-items: center; justify-content: space-between; padding: 10px 16px; border-bottom: 1px solid var(--border-light); }
.chat_panel_messages_header_left { display: flex; flex-direction: column; gap: 2px; }
.chat_panel_messages_header_name { font-size: 14px; font-weight: 600; color: var(--text); }
.chat_panel_messages_header_description { font-size: 11px; color: var(--text-muted); }
.chat_panel_messages_header_actions { display: flex; gap: 4px; }
.chat_panel_search_bar { padding: 6px 16px; border-bottom: 1px solid var(--border-light); }
.chat_panel_search_input { width: 100%; padding: 6px 10px; border: 1px solid var(--border); border-radius: var(--radius-sm); font-size: 12px; background: var(--bg); color: var(--text); outline: none; }
.chat_panel_messages_body { flex: 1; overflow-y: auto; padding: 12px 16px; display: flex; flex-direction: column; gap: 2px; }
.chat_panel_messages_empty { flex: 1; display: flex; align-items: center; justify-content: center; color: var(--text-muted); font-size: 13px; }
.chat_panel_load_more { align-self: center; padding: 4px 14px; font-size: 11px; border: 1px solid var(--border); border-radius: var(--radius-sm); background: var(--bg-white); cursor: pointer; color: var(--text-secondary); margin-bottom: 8px; }
.chat_panel_load_more:hover { background: var(--bg-hover); }
.chat_panel_date_divider { text-align: center; margin: 10px 0 6px; }
.chat_panel_date_divider span { font-size: 11px; color: var(--text-muted); background: var(--bg-white); padding: 0 10px; position: relative; }
.chat_panel_message { display: flex; gap: 8px; padding: 6px 8px; border-radius: var(--radius-sm); position: relative; }
.chat_panel_message:hover { background: var(--bg-hover); }
.chat_panel_message_own { background: var(--purple-bg); }
.chat_panel_message_own:hover { background: rgba(124,58,237,0.1); }
.chat_panel_message_pinned { border-left: 2px solid var(--amber); }
.chat_panel_message_avatar { width: 28px; height: 28px; border-radius: 50%; display: flex; align-items: center; justify-content: center; color: #fff; font-size: 12px; font-weight: 600; flex-shrink: 0; margin-top: 2px; }
.chat_panel_message_body { flex: 1; min-width: 0; }
.chat_panel_message_meta { display: flex; align-items: baseline; gap: 6px; margin-bottom: 2px; }
.chat_panel_message_author { font-size: 12px; font-weight: 600; color: var(--text); }
.chat_panel_message_time { font-size: 10px; color: var(--text-muted); }
.chat_panel_message_badge { font-size: 10px; color: var(--text-muted); font-style: italic; }
.chat_panel_message_badge_pin { color: var(--amber); }
.chat_panel_message_reply_indicator { font-size: 11px; color: var(--purple); margin-bottom: 2px; }
.chat_panel_message_content { font-size: 13px; line-height: 1.45; color: var(--text); word-break: break-word; }
.chat_panel_message_reactions { display: flex; gap: 4px; margin-top: 4px; flex-wrap: wrap; }
.chat_panel_reaction { font-size: 11px; padding: 1px 6px; border-radius: 10px; background: var(--bg); border: 1px solid var(--border); cursor: pointer; }
.chat_panel_reaction.mine { background: var(--purple-bg); border-color: var(--purple); }
.chat_panel_reaction:hover { background: var(--bg-hover); }
.chat_panel_message_toolbar { display: none; position: absolute; top: 2px; right: 4px; gap: 2px; background: var(--bg-white); border: 1px solid var(--border-light); border-radius: var(--radius-sm); padding: 2px; box-shadow: var(--shadow-md); z-index: 2; }
.chat_panel_message:hover .chat_panel_message_toolbar { display: flex; }
/* CHAT-TOUCH: the tapped message shows its bar. This rule is what makes reactions exist at
   all on a phone - :hover alone never fires there. */
.chat_panel_message_open .chat_panel_message_toolbar { display: flex; }
/* An in-flight message is visibly not confirmed yet (D-14: no premature checkmark). */
.chat_panel_message_pending { opacity: 0.55; }
/* CHAT-EDIT: the message the composer is rewriting. */
.chat_panel_message_editing { box-shadow: inset 0 0 0 1px var(--purple); }
.chat_panel_message_content :deep(code) { font-size: 12px; padding: 0 4px; border-radius: 4px; background: var(--bg-hover); }
.chat_panel_message_content :deep(a) { color: var(--purple-dark); text-decoration: underline; }
.chat_panel_message_shares { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 4px; }
.chat_panel_message_share { font-size: 12px; padding: 3px 10px; border-radius: 12px; border: 1px solid var(--purple-border); background: var(--bg-white); color: var(--purple-dark); cursor: pointer; }
.chat_panel_message_share:hover { background: var(--purple-bg); }
.chat_panel_message_share.missing { color: var(--text-muted); border-color: var(--border); text-decoration: line-through; }
.chat_panel_back_mobile { display: none; font-size: 16px; margin-right: 6px; }
@media (max-width: 768px) {
  .chat_panel_back_mobile { display: inline-flex; }
  .chat_panel_messages_header_left { flex: 1; min-width: 0; }
}
.chat_panel_button_ghost { background: none; border: none; cursor: pointer; font-size: 12px; padding: 2px 4px; border-radius: 4px; opacity: 0.7; }
.chat_panel_button_ghost:hover { opacity: 1; background: var(--bg-hover); }
.chat_panel_pinned_panel { border-top: 1px solid var(--border); padding: 8px 16px; max-height: 140px; overflow-y: auto; background: rgba(245,158,11,0.04); }
.chat_panel_pinned_header { font-size: 12px; font-weight: 600; color: var(--amber); margin-bottom: 6px; }
.chat_panel_pinned_item { font-size: 12px; color: var(--text-secondary); padding: 3px 0; border-bottom: 1px solid var(--border-light); }

/* CHAT-TOUCH: on a coarse pointer the bar sits under the message instead of floating over
   its top-right corner - overlapping the text made the first line untappable and unreadable.
   Targets are 32px so a thumb can actually hit them. */
@media (hover: none), (pointer: coarse) {
  .chat_panel_message { padding-right: 8px; }
  .chat_panel_message:hover .chat_panel_message_toolbar { display: none; }
  .chat_panel_message_open .chat_panel_message_toolbar {
    display: flex;
    position: static;
    width: 100%;
    margin: 4px 0 0 36px;
    box-shadow: none;
    flex-wrap: wrap;
  }
  .chat_panel_message_open { flex-wrap: wrap; }
  .chat_panel_message_toolbar .chat_panel_button_ghost { font-size: 16px; padding: 6px 10px; min-width: 32px; min-height: 32px; opacity: 1; }
  .chat_panel_reaction { font-size: 13px; padding: 4px 10px; }
}
</style>

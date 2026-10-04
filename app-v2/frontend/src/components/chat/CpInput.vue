<template>
  <div v-if="!isViewer" class="chat_panel_input_wrapper">
    <!-- CHAT-EDIT (03/10/2026): the composer is the edit surface (see stores/chat startEdit). -->
    <div v-if="store.editingMessage" class="chat_panel_reply_banner">
      <span class="chat_panel_reply_label">✏️ {{ t('chat_editing') }}</span>
      <button class="chat_panel_button_ghost" @click="cancelEdit">✕</button>
    </div>
    <div v-else-if="replyingToMsg" class="chat_panel_reply_banner">
      <span class="chat_panel_reply_label">↩ {{ replyingToMsg.author }}: {{ replyingToMsg.content.slice(0, 60) }}</span>
      <button class="chat_panel_button_ghost" @click="store.replyingTo = null">✕</button>
    </div>

    <div class="chat_panel_format_bar">
      <button class="chat_panel_format_button" @click="insertFormat('**', '**')" title="Bold">B</button>
      <button class="chat_panel_format_button chat_panel_format_italic" @click="insertFormat('_', '_')" title="Italic">I</button>
      <button class="chat_panel_format_button" @click="insertFormat('`', '`')" title="Code">&lt;/&gt;</button>
      <span class="chat_panel_format_separator"></span>
      <button class="chat_panel_format_button" @click="showEmojis = !showEmojis" :title="t('chat_emoji')">😊</button>
      <!-- CHAT-SHARE (03/10/2026): the 📎 button is gone. It never uploaded anything - it typed
           " [filename] " into the message, so the colleague got a file name and no file. A real
           attachment needs a storage bucket with org-scoped and MCP policies; until one exists,
           no button pretends to attach. The edit keeps the attachments as they are, so 📤 is
           hidden while editing. -->
      <button v-if="!store.editingMessage" class="chat_panel_format_button" @click="toggleShare" :title="t('chat_share')">📤</button>
    </div>

    <div v-if="showEmojis" class="chat_panel_emoji_grid">
      <span v-for="e in quickEmojis" :key="e" class="chat_panel_emoji_item" @click="insertEmoji(e)">{{ e }}</span>
    </div>

    <!-- CHAT-SHARE: picking a client or a task attaches a real reference to the message
         (chat_messages.attachments) instead of pasting " [name] " into the text. The menu
         searches the whole list - it used to offer the first five, nothing else reachable. -->
    <div v-if="showShare && !store.editingMessage" class="chat_panel_share_menu">
      <input v-model="shareQuery" :placeholder="t('chat_share_search')" class="chat_panel_share_search" />
      <div class="chat_panel_share_section">
        <span class="chat_panel_share_label">{{ t('chat_share_client') }}</span>
        <div v-if="shareClients.length" class="chat_panel_share_list">
          <button v-for="c in shareClients" :key="c.id" class="chat_panel_share_item" @click="addShare('client', c.id, c.name)">💼 {{ c.name }}</button>
        </div>
        <span v-else class="chat_panel_share_empty">{{ t('chat_no_items') }}</span>
      </div>
      <div class="chat_panel_share_section">
        <span class="chat_panel_share_label">{{ t('chat_share_task') }}</span>
        <div v-if="shareTasks.length" class="chat_panel_share_list">
          <button v-for="tk in shareTasks" :key="tk.id" class="chat_panel_share_item" @click="addShare('task', tk.id, tk.title)">⚡ {{ tk.title }}</button>
        </div>
        <span v-else class="chat_panel_share_empty">{{ t('chat_no_items') }}</span>
      </div>
      <div class="chat_panel_share_section">
        <span class="chat_panel_share_label">{{ t('chat_share_quote') }}</span>
        <div v-if="shareQuotes.length" class="chat_panel_share_list">
          <button v-for="q in shareQuotes" :key="q.id" class="chat_panel_share_item" @click="addShare('quote', q.id, q.title)">📄 {{ q.title }}</button>
        </div>
        <span v-else class="chat_panel_share_empty">{{ t('chat_no_items') }}</span>
      </div>
    </div>

    <div v-if="pendingShares.length && !store.editingMessage" class="chat_panel_pending_shares">
      <span v-for="s in pendingShares" :key="s.type + s.id" class="chat_panel_pending_share">
        {{ SHARE_ICONS[s.type] }} {{ s.name }}
        <button class="chat_panel_button_ghost" @click="removeShare(s)">✕</button>
      </span>
    </div>

    <div class="chat_panel_input_row">
      <textarea
        ref="inputRef"
        v-model="text"
        :placeholder="t('chat_placeholder')"
        class="chat_panel_textarea"
        rows="1"
        @input="autoResize"
        @keydown="handleKey"
      ></textarea>
      <button class="chat_panel_send_button" :disabled="!canSend" @click="send">
        {{ store.editingMessage ? t('chat_save') : t('chat_send') }}
      </button>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, nextTick } from 'vue'
import { useI18n } from 'vue-i18n'
import { useChatStore } from '@/stores/chat'
import { useAuthStore } from '@/stores/auth'
import { useClientStore } from '@/stores/clients'
import { useTaskStore } from '@/stores/tasks'
import { useQuoteStore } from '@/stores/quotes'
import { SHARE_ICONS } from './chatShares'

const { t } = useI18n()
const store = useChatStore()
const authStore = useAuthStore()
const clientsStore = useClientStore()
const tasksStore = useTaskStore()
const quotesStore = useQuoteStore()

const text = ref('')
const inputRef = ref(null)
const showEmojis = ref(false)
const showShare = ref(false)
const saving = ref(false)
// CHAT-EDIT: what the user had typed before pressing ✏️. Replacing it with the message being
// edited and never giving it back would silently eat a half-written message.
let draftBeforeEdit = ''

const quickEmojis = ['👍', '❤️', '😊', '🎉', '🔥', '👀', '💡', '✅', '⚠️', '🚀', '💪', '🙏']

const isViewer = computed(() => authStore.profile?.org_role === 'viewer')
const replyingToMsg = computed(() =>
  store.replyingTo ? store.activeMessages.find(m => m.id === store.replyingTo) : null
)

// CHAT-SHARE: the references picked in 📤, sent as the message's attachments.
const pendingShares = ref([])
const shareQuery = ref('')
const SHARE_LIMIT = 5
function matches(name) {
  const q = shareQuery.value.trim().toLowerCase()
  return !q || (name || '').toLowerCase().includes(q)
}
const shareClients = computed(() => (clientsStore.clients || []).filter(c => matches(c.name)).slice(0, SHARE_LIMIT))
const shareTasks = computed(() => (tasksStore.tasks || []).filter(tk => matches(tk.title)).slice(0, SHARE_LIMIT))
const shareQuotes = computed(() => (quotesStore.quotes || []).filter(q => matches(q.title)).slice(0, SHARE_LIMIT))

// Clients and tasks are loaded by AppLayout; quotes only by the Quotes screen - so the first
// opening of the menu loads them, otherwise "no items" would be a lie on every other screen.
let quotesRequested = false
function toggleShare() {
  showShare.value = !showShare.value
  if (showShare.value && !quotesRequested && !(quotesStore.quotes || []).length) {
    quotesRequested = true
    quotesStore.loadQuotes()
  }
}

function addShare(type, id, name) {
  if (!pendingShares.value.some(s => s.type === type && s.id === id)) {
    pendingShares.value.push({ type, id, name })
  }
  showShare.value = false
  shareQuery.value = ''
}

function removeShare(share) {
  pendingShares.value = pendingShares.value.filter(s => !(s.type === share.type && s.id === share.id))
}

const canSend = computed(() => {
  if (store.sending || saving.value) return false
  if (store.editingMessage) return !!text.value.trim()
  return !!text.value.trim() || pendingShares.value.length > 0
})

function autoResize() {
  const el = inputRef.value
  if (!el) return
  el.style.height = 'auto'
  el.style.height = Math.min(el.scrollHeight, 120) + 'px'
}

// The edit starts (load the message), switches to another message (load that one) or ends -
// saved, cancelled, the message deleted, the channel changed - and the draft comes back.
watch(() => store.editingMessage?.id, (id, oldId) => {
  if (id) {
    if (!oldId) draftBeforeEdit = text.value
    text.value = store.editingMessage.content
    nextTick(() => { autoResize(); inputRef.value?.focus() })
  } else if (oldId) {
    text.value = draftBeforeEdit
    draftBeforeEdit = ''
    nextTick(autoResize)
  }
})

function cancelEdit() {
  store.cancelEdit()
}

function handleKey(e) {
  if (e.key === 'Escape' && store.editingMessage) {
    e.preventDefault()
    cancelEdit()
    return
  }
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    send()
  }
}

// D-15: the edit ends only on a confirmed write (the store clears editingMessage then). On a
// failure the rewritten text stays in the composer and the panel's error banner explains.
async function saveEdit() {
  const ed = store.editingMessage
  const content = text.value.trim()
  if (!ed || !content || saving.value) return
  if (content === ed.content) { cancelEdit(); return }
  saving.value = true
  try {
    await store.editMessage(ed.channelId, ed.id, content)
  } finally {
    saving.value = false
  }
}

// CHAT-SEND-RESULT (03/10/2026): the composer clears on { success } only - a failed send, an
// over-long message or the 1 s cooldown used to wipe what the user had typed.
async function send() {
  if (store.editingMessage) return saveEdit()
  const content = text.value.trim()
  if ((!content && !pendingShares.value.length) || !store.activeChannel) return
  try {
    // G9-21: the store resolves name + uid (first name, otherwise the email prefix — never "user_default")
    const attachments = pendingShares.value.map(s => ({ type: s.type, id: s.id, name: s.name }))
    const result = await store.sendMessage(store.activeChannel, content, undefined, undefined, attachments)
    if (!result?.success) return
    text.value = ''
    pendingShares.value = []
    showEmojis.value = false
    showShare.value = false
    if (inputRef.value) inputRef.value.style.height = 'auto'
  } catch (e) {
    console.error('Send failed:', e.message || e)
  }
}

function insertFormat(before, after) {
  const el = inputRef.value
  if (!el) return
  const start = el.selectionStart
  const end = el.selectionEnd
  const selected = text.value.substring(start, end)
  text.value = text.value.substring(0, start) + before + selected + after + text.value.substring(end)
}

function insertEmoji(emoji) {
  text.value += emoji
  showEmojis.value = false
}
</script>

<style scoped>
.chat_panel_input_wrapper { border-top: 1px solid var(--border-light); background: var(--bg-white); }
.chat_panel_reply_banner { display: flex; align-items: center; justify-content: space-between; padding: 6px 14px; background: var(--purple-bg); font-size: 11px; color: var(--purple); }
.chat_panel_reply_label { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex: 1; }
.chat_panel_format_bar { display: flex; align-items: center; gap: 2px; padding: 4px 14px 0; }
.chat_panel_format_button { background: none; border: none; cursor: pointer; font-size: 12px; padding: 3px 6px; border-radius: 4px; color: var(--text-muted); }
.chat_panel_format_button:hover { background: var(--bg-hover); color: var(--text); }
.chat_panel_format_italic { font-style: italic; }
.chat_panel_format_separator { width: 1px; height: 14px; background: var(--border-light); margin: 0 4px; }
.chat_panel_emoji_grid { display: flex; flex-wrap: wrap; gap: 4px; padding: 6px 14px; }
.chat_panel_emoji_item { font-size: 16px; cursor: pointer; padding: 2px; border-radius: 4px; }
.chat_panel_emoji_item:hover { background: var(--bg-hover); }
.chat_panel_share_menu { padding: 6px 14px; border-top: 1px solid var(--border-light); }
.chat_panel_share_section { margin-bottom: 6px; }
.chat_panel_share_label { font-size: 11px; font-weight: 600; color: var(--text-muted); text-transform: uppercase; }
.chat_panel_share_list { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 4px; }
.chat_panel_share_item { font-size: 11px; padding: 2px 8px; border-radius: 12px; border: 1px solid var(--border); background: var(--bg); cursor: pointer; color: var(--text-secondary); }
.chat_panel_share_item:hover { background: var(--bg-hover); }
.chat_panel_share_empty { font-size: 11px; color: var(--text-muted); }
.chat_panel_share_search { width: 100%; margin-bottom: 6px; padding: 6px 10px; border: 1px solid var(--border); border-radius: var(--radius-sm); font-size: 12px; font-family: inherit; background: var(--bg); color: var(--text); outline: none; }
.chat_panel_share_search:focus { border-color: var(--purple); }
.chat_panel_pending_shares { display: flex; flex-wrap: wrap; gap: 6px; padding: 6px 14px 0; }
.chat_panel_pending_share { display: inline-flex; align-items: center; gap: 4px; font-size: 12px; padding: 2px 4px 2px 10px; border-radius: 12px; background: var(--purple-bg); border: 1px solid var(--purple-border); color: var(--purple-dark); }
.chat_panel_input_row { display: flex; gap: 8px; padding: 6px 14px 10px; align-items: flex-end; }
.chat_panel_textarea { flex: 1; resize: none; border: 1px solid var(--border); border-radius: var(--radius-sm); padding: 8px 10px; font-size: 13px; font-family: inherit; background: var(--bg); color: var(--text); outline: none; min-height: 36px; max-height: 120px; }
.chat_panel_textarea:focus { border-color: var(--purple); }
.chat_panel_send_button { padding: 8px 16px; border: none; border-radius: var(--radius-sm); background: var(--purple); color: #fff; font-size: 12px; font-weight: 500; cursor: pointer; white-space: nowrap; }
.chat_panel_send_button:disabled { opacity: 0.4; cursor: not-allowed; }
.chat_panel_send_button:not(:disabled):hover { background: var(--purple-dark); }
.chat_panel_button_ghost { background: none; border: none; cursor: pointer; font-size: 12px; color: var(--text-muted); padding: 2px; }
</style>

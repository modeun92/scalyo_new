<template>
  <div class="chat_panel_messages_wrapper">
    <div v-if="!store.connected" class="chat_panel_banner_disconnected">
      {{ t('chat_disconnected') }}
    </div>

    <div v-if="activeChannel" class="chat_panel_messages_header">
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

    <div class="chat_panel_messages_body" ref="messagesRef">
      <button v-if="store.activeMessages.length >= 100" class="chat_panel_load_more" @click="store.loadOlderMessages(store.activeChannel)">
        {{ t('chat_load_more') }}
      </button>

      <div v-if="store.messagesLoading" class="chat_panel_messages_empty">{{ t('chat_loading') }}</div>
      <div v-else-if="filteredMessages.length === 0" class="chat_panel_messages_empty">{{ t('chat_no_messages') }}</div>

      <template v-for="(group, date) in groupedMessages" :key="date">
        <div class="chat_panel_date_divider">
          <span>{{ formatDate(date) }}</span>
        </div>
        <div
          v-for="msg in group"
          :key="msg.id"
          class="chat_panel_message"
          :class="{ 'chat_panel_message_own': msg.authorId === currentUserId, 'chat_panel_message_pinned': msg.pinned }"
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
            <div class="chat_panel_message_content" v-html="sanitizeHtml(msg.content)"></div>
            <div v-if="msg.reactions && msg.reactions.length" class="chat_panel_message_reactions">
              <span
                v-for="(r, ri) in msg.reactions"
                :key="ri"
                class="chat_panel_reaction"
                :class="{ mine: r.users && r.users.includes(currentUserId) }"
                @click="store.addReaction(store.activeChannel, msg.id, r.emoji, currentUserId)"
              >{{ r.emoji }} {{ r.users?.length || 0 }}</span>
            </div>
          </div>
          <div v-if="!isViewer" class="chat_panel_message_toolbar">
            <button class="chat_panel_button_ghost" @click="store.addReaction(store.activeChannel, msg.id, '👍', currentUserId)">👍</button>
            <button class="chat_panel_button_ghost" @click="store.addReaction(store.activeChannel, msg.id, '❤️', currentUserId)">❤️</button>
            <button class="chat_panel_button_ghost" @click="store.setReplyTo(store.activeChannel, msg.id)">↩</button>
            <button class="chat_panel_button_ghost" @click="store.pinMessage(store.activeChannel, msg.id)">📌</button>
            <button v-if="msg.authorId === currentUserId" class="chat_panel_button_ghost" @click="startEdit(msg)">✏️</button>
            <button v-if="msg.authorId === currentUserId" class="chat_panel_button_ghost" @click="store.deleteMessage(store.activeChannel, msg.id)">🗑️</button>
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
  </div>
</template>

<script setup>
import { ref, computed, watch, nextTick } from 'vue'
import { useI18n } from 'vue-i18n'
import { useChatStore } from '@/stores/chat'
import { useAuthStore } from '@/stores/auth'
import { sanitizeHtml } from '@/utils/sanitize'

defineEmits(['rename-channel', 'create-task'])

const { t, locale } = useI18n()
const store = useChatStore()
const authStore = useAuthStore()

const messagesRef = ref(null)
const showSearch = ref(false)
const showPinned = ref(false)
const searchQuery = ref('')

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

function startEdit(msg) {
  store.editingMessage = { id: msg.id, content: msg.content }
}

function scrollToBottom() {
  if (messagesRef.value) messagesRef.value.scrollTop = messagesRef.value.scrollHeight
}

watch(() => store.activeMessages.length, () => { nextTick(() => scrollToBottom()) })
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
.chat_panel_message_toolbar { display: none; position: absolute; top: 2px; right: 4px; gap: 2px; background: var(--bg-white); border: 1px solid var(--border-light); border-radius: var(--radius-sm); padding: 2px; box-shadow: var(--shadow-md); }
.chat_panel_message:hover .chat_panel_message_toolbar { display: flex; }
.chat_panel_button_ghost { background: none; border: none; cursor: pointer; font-size: 12px; padding: 2px 4px; border-radius: 4px; opacity: 0.7; }
.chat_panel_button_ghost:hover { opacity: 1; background: var(--bg-hover); }
.chat_panel_pinned_panel { border-top: 1px solid var(--border); padding: 8px 16px; max-height: 140px; overflow-y: auto; background: rgba(245,158,11,0.04); }
.chat_panel_pinned_header { font-size: 12px; font-weight: 600; color: var(--amber); margin-bottom: 6px; }
.chat_panel_pinned_item { font-size: 12px; color: var(--text-secondary); padding: 3px 0; border-bottom: 1px solid var(--border-light); }
</style>

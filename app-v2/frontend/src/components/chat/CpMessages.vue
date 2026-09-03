<template>
  <div class="cp-messages-wrap">
    <div v-if="!store.connected" class="cp-banner-disconnected">
      {{ t('chat_disconnected') }}
    </div>

    <div v-if="activeChannel" class="cp-messages-header">
      <div class="cp-messages-header-left">
        <span class="cp-messages-header-name">{{ activeChannel.type === 'dm' ? store.channelLabel(activeChannel) : '# ' + activeChannel.name }}</span>
        <span v-if="activeChannel.description" class="cp-messages-header-desc">{{ activeChannel.description }}</span>
      </div>
      <div class="cp-messages-header-actions">
        <button class="cp-btn-ghost" @click="showSearch = !showSearch" :title="t('chat_search_msg')">🔍</button>
        <button class="cp-btn-ghost" @click="showPinned = !showPinned">📌</button>
        <button v-if="canManageChannel && activeChannel.type !== 'dm'" class="cp-btn-ghost" @click="$emit('rename-channel', activeChannel)">✏️</button>
      </div>
    </div>

    <div v-if="showSearch" class="cp-search-bar">
      <input v-model="searchQuery" :placeholder="t('chat_search_msg')" class="cp-search-input" />
    </div>

    <div class="cp-messages-body" ref="messagesRef">
      <button v-if="store.activeMessages.length >= 100" class="cp-load-more" @click="store.loadOlderMessages(store.activeChannel)">
        {{ t('chat_load_more') }}
      </button>

      <div v-if="store.messagesLoading" class="cp-messages-empty">{{ t('chat_loading') }}</div>
      <div v-else-if="filteredMessages.length === 0" class="cp-messages-empty">{{ t('chat_no_messages') }}</div>

      <template v-for="(group, date) in groupedMessages" :key="date">
        <div class="cp-date-divider">
          <span>{{ formatDate(date) }}</span>
        </div>
        <div
          v-for="msg in group"
          :key="msg.id"
          class="cp-msg"
          :class="{ 'cp-msg-own': msg.authorId === currentUserId, 'cp-msg-pinned': msg.pinned }"
        >
          <div class="cp-msg-avatar" :style="{ background: hashColor(msg.authorId) }">
            {{ store.authorLabel(msg)?.charAt(0) || '?' }}
          </div>
          <div class="cp-msg-body">
            <div class="cp-msg-meta">
              <span class="cp-msg-author">{{ store.authorLabel(msg) }}</span>
              <span class="cp-msg-time">{{ formatMsgTime(msg.timestamp) }}</span>
              <span v-if="msg.edited" class="cp-msg-badge">{{ t('chat_edited') }}</span>
              <span v-if="msg.pinned" class="cp-msg-badge cp-msg-badge-pin">{{ t('chat_pinned') }}</span>
            </div>
            <div v-if="msg.replyTo" class="cp-msg-reply-indicator">
              ↩ {{ replyPreview(msg.replyTo) }}
            </div>
            <div class="cp-msg-content" v-html="sanitizeHtml(msg.content)"></div>
            <div v-if="msg.reactions && msg.reactions.length" class="cp-msg-reactions">
              <span
                v-for="(r, ri) in msg.reactions"
                :key="ri"
                class="cp-reaction"
                :class="{ mine: r.users && r.users.includes(currentUserId) }"
                @click="store.addReaction(store.activeChannel, msg.id, r.emoji, currentUserId)"
              >{{ r.emoji }} {{ r.users?.length || 0 }}</span>
            </div>
          </div>
          <div v-if="!isViewer" class="cp-msg-toolbar">
            <button class="cp-btn-ghost" @click="store.addReaction(store.activeChannel, msg.id, '👍', currentUserId)">👍</button>
            <button class="cp-btn-ghost" @click="store.addReaction(store.activeChannel, msg.id, '❤️', currentUserId)">❤️</button>
            <button class="cp-btn-ghost" @click="store.setReplyTo(store.activeChannel, msg.id)">↩</button>
            <button class="cp-btn-ghost" @click="store.pinMessage(store.activeChannel, msg.id)">📌</button>
            <button v-if="msg.authorId === currentUserId" class="cp-btn-ghost" @click="startEdit(msg)">✏️</button>
            <button v-if="msg.authorId === currentUserId" class="cp-btn-ghost" @click="store.deleteMessage(store.activeChannel, msg.id)">🗑️</button>
          </div>
        </div>
      </template>
    </div>

    <div v-if="showPinned && store.pinnedMessages.length" class="cp-pinned-panel">
      <div class="cp-pinned-header">📌 {{ t('chat_pinned') }} ({{ store.pinnedMessages.length }})</div>
      <div v-for="pm in store.pinnedMessages" :key="pm.id" class="cp-pinned-item">
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

// C7 : heure formatée avec la locale de l'app (fuseau = device)
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
.cp-messages-wrap { flex: 1; display: flex; flex-direction: column; min-height: 0; }
.cp-banner-disconnected { padding: 6px 14px; background: rgba(239,68,68,0.08); color: var(--red); font-size: 12px; text-align: center; }
.cp-messages-header { display: flex; align-items: center; justify-content: space-between; padding: 10px 16px; border-bottom: 1px solid var(--border-light); }
.cp-messages-header-left { display: flex; flex-direction: column; gap: 2px; }
.cp-messages-header-name { font-size: 14px; font-weight: 600; color: var(--text); }
.cp-messages-header-desc { font-size: 11px; color: var(--text-muted); }
.cp-messages-header-actions { display: flex; gap: 4px; }
.cp-search-bar { padding: 6px 16px; border-bottom: 1px solid var(--border-light); }
.cp-search-input { width: 100%; padding: 6px 10px; border: 1px solid var(--border); border-radius: var(--radius-sm); font-size: 12px; background: var(--bg); color: var(--text); outline: none; }
.cp-messages-body { flex: 1; overflow-y: auto; padding: 12px 16px; display: flex; flex-direction: column; gap: 2px; }
.cp-messages-empty { flex: 1; display: flex; align-items: center; justify-content: center; color: var(--text-muted); font-size: 13px; }
.cp-load-more { align-self: center; padding: 4px 14px; font-size: 11px; border: 1px solid var(--border); border-radius: var(--radius-sm); background: var(--bg-white); cursor: pointer; color: var(--text-secondary); margin-bottom: 8px; }
.cp-load-more:hover { background: var(--bg-hover); }
.cp-date-divider { text-align: center; margin: 10px 0 6px; }
.cp-date-divider span { font-size: 11px; color: var(--text-muted); background: var(--bg-white); padding: 0 10px; position: relative; }
.cp-msg { display: flex; gap: 8px; padding: 6px 8px; border-radius: var(--radius-sm); position: relative; }
.cp-msg:hover { background: var(--bg-hover); }
.cp-msg-own { background: var(--purple-bg); }
.cp-msg-own:hover { background: rgba(124,58,237,0.1); }
.cp-msg-pinned { border-left: 2px solid var(--amber); }
.cp-msg-avatar { width: 28px; height: 28px; border-radius: 50%; display: flex; align-items: center; justify-content: center; color: #fff; font-size: 12px; font-weight: 600; flex-shrink: 0; margin-top: 2px; }
.cp-msg-body { flex: 1; min-width: 0; }
.cp-msg-meta { display: flex; align-items: baseline; gap: 6px; margin-bottom: 2px; }
.cp-msg-author { font-size: 12px; font-weight: 600; color: var(--text); }
.cp-msg-time { font-size: 10px; color: var(--text-muted); }
.cp-msg-badge { font-size: 10px; color: var(--text-muted); font-style: italic; }
.cp-msg-badge-pin { color: var(--amber); }
.cp-msg-reply-indicator { font-size: 11px; color: var(--purple); margin-bottom: 2px; }
.cp-msg-content { font-size: 13px; line-height: 1.45; color: var(--text); word-break: break-word; }
.cp-msg-reactions { display: flex; gap: 4px; margin-top: 4px; flex-wrap: wrap; }
.cp-reaction { font-size: 11px; padding: 1px 6px; border-radius: 10px; background: var(--bg); border: 1px solid var(--border); cursor: pointer; }
.cp-reaction.mine { background: var(--purple-bg); border-color: var(--purple); }
.cp-reaction:hover { background: var(--bg-hover); }
.cp-msg-toolbar { display: none; position: absolute; top: 2px; right: 4px; gap: 2px; background: var(--bg-white); border: 1px solid var(--border-light); border-radius: var(--radius-sm); padding: 2px; box-shadow: var(--shadow-md); }
.cp-msg:hover .cp-msg-toolbar { display: flex; }
.cp-btn-ghost { background: none; border: none; cursor: pointer; font-size: 12px; padding: 2px 4px; border-radius: 4px; opacity: 0.7; }
.cp-btn-ghost:hover { opacity: 1; background: var(--bg-hover); }
.cp-pinned-panel { border-top: 1px solid var(--border); padding: 8px 16px; max-height: 140px; overflow-y: auto; background: rgba(245,158,11,0.04); }
.cp-pinned-header { font-size: 12px; font-weight: 600; color: var(--amber); margin-bottom: 6px; }
.cp-pinned-item { font-size: 12px; color: var(--text-secondary); padding: 3px 0; border-bottom: 1px solid var(--border-light); }
</style>

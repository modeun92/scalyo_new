<template>
  <div v-if="!isViewer" class="cp-input-wrap">
    <div v-if="replyingToMsg" class="cp-reply-banner">
      <span class="cp-reply-label">↩ {{ replyingToMsg.author }}: {{ replyingToMsg.content.slice(0, 60) }}</span>
      <button class="cp-btn-ghost" @click="store.replyingTo = null">✕</button>
    </div>

    <div class="cp-format-bar">
      <button class="cp-fmt-btn" @click="insertFormat('**', '**')" title="Bold">B</button>
      <button class="cp-fmt-btn cp-fmt-italic" @click="insertFormat('_', '_')" title="Italic">I</button>
      <button class="cp-fmt-btn" @click="insertFormat('`', '`')" title="Code">&lt;/&gt;</button>
      <span class="cp-fmt-sep"></span>
      <button class="cp-fmt-btn" @click="showEmojis = !showEmojis" :title="t('chat_emoji')">😊</button>
      <label class="cp-fmt-btn" :title="t('chat_attach')">📎<input type="file" hidden @change="handleAttach" /></label>
      <button class="cp-fmt-btn" @click="showShare = !showShare" :title="t('chat_share')">📤</button>
    </div>

    <div v-if="showEmojis" class="cp-emoji-grid">
      <span v-for="e in quickEmojis" :key="e" class="cp-emoji-item" @click="insertEmoji(e)">{{ e }}</span>
    </div>

    <div v-if="showShare" class="cp-share-menu">
      <div class="cp-share-section">
        <span class="cp-share-label">{{ t('chat_share_client') }}</span>
        <div v-if="clientsStore.clients?.length" class="cp-share-list">
          <button v-for="c in clientsStore.clients.slice(0, 5)" :key="c.id" class="cp-share-item" @click="insertShare(c.name)">{{ c.name }}</button>
        </div>
        <span v-else class="cp-share-empty">{{ t('chat_no_items') }}</span>
      </div>
      <div class="cp-share-section">
        <span class="cp-share-label">{{ t('chat_share_task') }}</span>
        <div v-if="tasksStore.tasks?.length" class="cp-share-list">
          <button v-for="tk in tasksStore.tasks.slice(0, 5)" :key="tk.id" class="cp-share-item" @click="insertShare(tk.title)">{{ tk.title }}</button>
        </div>
        <span v-else class="cp-share-empty">{{ t('chat_no_items') }}</span>
      </div>
    </div>

    <div class="cp-input-row">
      <textarea
        ref="inputRef"
        v-model="text"
        :placeholder="t('chat_placeholder')"
        class="cp-textarea"
        rows="1"
        @input="autoResize"
        @keydown="handleKey"
      ></textarea>
      <button class="cp-send-btn" :disabled="!text.trim() || store.sending" @click="send">
        {{ t('chat_send') }}
      </button>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useChatStore } from '@/stores/chat'
import { useAuthStore } from '@/stores/auth'
import { useClientStore } from '@/stores/clients'
import { useTaskStore } from '@/stores/tasks'

const { t } = useI18n()
const store = useChatStore()
const authStore = useAuthStore()
const clientsStore = useClientStore()
const tasksStore = useTaskStore()

const text = ref('')
const inputRef = ref(null)
const showEmojis = ref(false)
const showShare = ref(false)

const quickEmojis = ['👍', '❤️', '😊', '🎉', '🔥', '👀', '💡', '✅', '⚠️', '🚀', '💪', '🙏']

const isViewer = computed(() => authStore.profile?.org_role === 'viewer')
const replyingToMsg = computed(() =>
  store.replyingTo ? store.activeMessages.find(m => m.id === store.replyingTo) : null
)

function autoResize() {
  const el = inputRef.value
  if (!el) return
  el.style.height = 'auto'
  el.style.height = Math.min(el.scrollHeight, 120) + 'px'
}

function handleKey(e) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    send()
  }
}

async function send() {
  const content = text.value.trim()
  if (!content || !store.activeChannel) return
  try {
    // G9-21: the store resolves name + uid (first name, otherwise the email prefix — never "user_default")
    await store.sendMessage(store.activeChannel, content)
    text.value = ''
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

function insertShare(name) {
  text.value += ' [' + name + '] '
  showShare.value = false
}

function handleAttach(e) {
  const file = e.target?.files?.[0]
  if (file) text.value += ' [' + file.name + '] '
}
</script>

<style scoped>
.cp-input-wrap { border-top: 1px solid var(--border-light); background: var(--bg-white); }
.cp-reply-banner { display: flex; align-items: center; justify-content: space-between; padding: 6px 14px; background: var(--purple-bg); font-size: 11px; color: var(--purple); }
.cp-reply-label { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex: 1; }
.cp-format-bar { display: flex; align-items: center; gap: 2px; padding: 4px 14px 0; }
.cp-fmt-btn { background: none; border: none; cursor: pointer; font-size: 12px; padding: 3px 6px; border-radius: 4px; color: var(--text-muted); }
.cp-fmt-btn:hover { background: var(--bg-hover); color: var(--text); }
.cp-fmt-italic { font-style: italic; }
.cp-fmt-sep { width: 1px; height: 14px; background: var(--border-light); margin: 0 4px; }
.cp-emoji-grid { display: flex; flex-wrap: wrap; gap: 4px; padding: 6px 14px; }
.cp-emoji-item { font-size: 16px; cursor: pointer; padding: 2px; border-radius: 4px; }
.cp-emoji-item:hover { background: var(--bg-hover); }
.cp-share-menu { padding: 6px 14px; border-top: 1px solid var(--border-light); }
.cp-share-section { margin-bottom: 6px; }
.cp-share-label { font-size: 11px; font-weight: 600; color: var(--text-muted); text-transform: uppercase; }
.cp-share-list { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 4px; }
.cp-share-item { font-size: 11px; padding: 2px 8px; border-radius: 12px; border: 1px solid var(--border); background: var(--bg); cursor: pointer; color: var(--text-secondary); }
.cp-share-item:hover { background: var(--bg-hover); }
.cp-share-empty { font-size: 11px; color: var(--text-muted); }
.cp-input-row { display: flex; gap: 8px; padding: 6px 14px 10px; align-items: flex-end; }
.cp-textarea { flex: 1; resize: none; border: 1px solid var(--border); border-radius: var(--radius-sm); padding: 8px 10px; font-size: 13px; font-family: inherit; background: var(--bg); color: var(--text); outline: none; min-height: 36px; max-height: 120px; }
.cp-textarea:focus { border-color: var(--purple); }
.cp-send-btn { padding: 8px 16px; border: none; border-radius: var(--radius-sm); background: var(--purple); color: #fff; font-size: 12px; font-weight: 500; cursor: pointer; white-space: nowrap; }
.cp-send-btn:disabled { opacity: 0.4; cursor: not-allowed; }
.cp-send-btn:not(:disabled):hover { background: var(--purple-dark); }
.cp-btn-ghost { background: none; border: none; cursor: pointer; font-size: 12px; color: var(--text-muted); padding: 2px; }
</style>

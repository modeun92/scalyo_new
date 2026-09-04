<template>
  <div v-if="!isViewer" class="chat_panel_input_wrapper">
    <div v-if="replyingToMsg" class="chat_panel_reply_banner">
      <span class="chat_panel_reply_label">↩ {{ replyingToMsg.author }}: {{ replyingToMsg.content.slice(0, 60) }}</span>
      <button class="chat_panel_button_ghost" @click="store.replyingTo = null">✕</button>
    </div>

    <div class="chat_panel_format_bar">
      <button class="chat_panel_format_button" @click="insertFormat('**', '**')" title="Bold">B</button>
      <button class="chat_panel_format_button chat_panel_format_italic" @click="insertFormat('_', '_')" title="Italic">I</button>
      <button class="chat_panel_format_button" @click="insertFormat('`', '`')" title="Code">&lt;/&gt;</button>
      <span class="chat_panel_format_separator"></span>
      <button class="chat_panel_format_button" @click="showEmojis = !showEmojis" :title="t('chat_emoji')">😊</button>
      <label class="chat_panel_format_button" :title="t('chat_attach')">📎<input type="file" hidden @change="handleAttach" /></label>
      <button class="chat_panel_format_button" @click="showShare = !showShare" :title="t('chat_share')">📤</button>
    </div>

    <div v-if="showEmojis" class="chat_panel_emoji_grid">
      <span v-for="e in quickEmojis" :key="e" class="chat_panel_emoji_item" @click="insertEmoji(e)">{{ e }}</span>
    </div>

    <div v-if="showShare" class="chat_panel_share_menu">
      <div class="chat_panel_share_section">
        <span class="chat_panel_share_label">{{ t('chat_share_client') }}</span>
        <div v-if="clientsStore.clients?.length" class="chat_panel_share_list">
          <button v-for="c in clientsStore.clients.slice(0, 5)" :key="c.id" class="chat_panel_share_item" @click="insertShare(c.name)">{{ c.name }}</button>
        </div>
        <span v-else class="chat_panel_share_empty">{{ t('chat_no_items') }}</span>
      </div>
      <div class="chat_panel_share_section">
        <span class="chat_panel_share_label">{{ t('chat_share_task') }}</span>
        <div v-if="tasksStore.tasks?.length" class="chat_panel_share_list">
          <button v-for="tk in tasksStore.tasks.slice(0, 5)" :key="tk.id" class="chat_panel_share_item" @click="insertShare(tk.title)">{{ tk.title }}</button>
        </div>
        <span v-else class="chat_panel_share_empty">{{ t('chat_no_items') }}</span>
      </div>
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
      <button class="chat_panel_send_button" :disabled="!text.trim() || store.sending" @click="send">
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
.chat_panel_input_row { display: flex; gap: 8px; padding: 6px 14px 10px; align-items: flex-end; }
.chat_panel_textarea { flex: 1; resize: none; border: 1px solid var(--border); border-radius: var(--radius-sm); padding: 8px 10px; font-size: 13px; font-family: inherit; background: var(--bg); color: var(--text); outline: none; min-height: 36px; max-height: 120px; }
.chat_panel_textarea:focus { border-color: var(--purple); }
.chat_panel_send_button { padding: 8px 16px; border: none; border-radius: var(--radius-sm); background: var(--purple); color: #fff; font-size: 12px; font-weight: 500; cursor: pointer; white-space: nowrap; }
.chat_panel_send_button:disabled { opacity: 0.4; cursor: not-allowed; }
.chat_panel_send_button:not(:disabled):hover { background: var(--purple-dark); }
.chat_panel_button_ghost { background: none; border: none; cursor: pointer; font-size: 12px; color: var(--text-muted); padding: 2px; }
</style>

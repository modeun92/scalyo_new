<template>
  <div class="chat_panel_chat_panel_wrapper" :class="{ chat_panel_show_messages: showMessagesOnMobile }">
    <CpSidebar
      :show-close="showClose"
      @select="handleSelect"
      @create-channel="showCreateChannel = true"
      @open-dm="handleOpenDm"
      @close="$emit('close')"
    />
    <div class="chat_panel_main">
      <!-- C-07: the store's failures are displayed (the panel used to be mute) -->
      <div v-if="store.lastError" class="chat_panel_error_toast">
        <span>{{ t('chat_err_' + store.lastError) }}</span>
        <button class="chat_panel_error_close" @click="store.clearError()">✕</button>
      </div>
      <CpMessages
        @rename-channel="handleRenameChannel"
        @create-task="handleCreateTask"
        @back="showMessagesOnMobile = false"
      />
      <CpInput />
    </div>
    <CpSlideOvers
      :showCreateChannel="showCreateChannel"
      :showCreateTask="showCreateTask"
      :taskSource="taskSource"
      :renamingChannel="renamingChannel"
      @close-create-channel="showCreateChannel = false"
      @close-create-task="closeCreateTask"
      @close-rename="renamingChannel = null"
    />
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useChatStore } from '@/stores/chat'
import CpSidebar from './CpSidebar.vue'
import CpMessages from './CpMessages.vue'
import CpInput from './CpInput.vue'
import CpSlideOvers from './CpSlideOvers.vue'

defineEmits(['close'])
defineProps({ showClose: { type: Boolean, default: true } })

const { t } = useI18n()
const store = useChatStore()
const showCreateChannel = ref(false)
const showCreateTask = ref(false)
// CHAT-TASK: the message the task is created from (pre-fills the slide-over).
const taskSource = ref(null)
const renamingChannel = ref(null)
// CHAT-MOBILE (03/10/2026): at 768px and below the panel is full screen, but the 220px channel
// list stayed beside the messages and left them ~150px - one Korean word per line. A phone now
// shows the list OR the messages: picking a channel or a person opens the messages, ← in their
// header comes back. Only the CSS reads this flag, so wider screens are untouched.
const showMessagesOnMobile = ref(false)

function handleCreateTask(msg) {
  taskSource.value = msg || null
  showCreateTask.value = true
}

function closeCreateTask() {
  showCreateTask.value = false
  taskSource.value = null
}

function handleSelect(id) {
  store.setActive(id)
  showMessagesOnMobile.value = true
}

function handleOpenDm(userId) {
  store.openDm(userId)
  showMessagesOnMobile.value = true
}

function handleRenameChannel(ch) {
  renamingChannel.value = ch
}

onMounted(() => {
  if (store.channels.length === 0) store.init()
  // G9-20: the surface becomes visible — the displayed channel is marked as read
  store.setSurfaceVisible(true)
})

onUnmounted(() => {
  // G9-20: do NOT destroy the realtime connection here (otherwise no badge after closing).
  // destroy() belongs to AppLayout unmount / logout.
  store.setSurfaceVisible(false)
})
</script>

<style scoped>
.chat_panel_chat_panel_wrapper {
  display: flex;
  width: 100%;
  height: 100%;
  border-radius: var(--radius-md);
  overflow: hidden;
  background: var(--bg-white);
}
.chat_panel_main {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
}
.chat_panel_error_toast {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 14px;
  background: rgba(239, 68, 68, 0.08);
  color: var(--red);
  font-size: 12px;
  border-bottom: 1px solid var(--border-light);
}
.chat_panel_error_close {
  background: none;
  border: none;
  cursor: pointer;
  color: var(--red);
  font-size: 12px;
  padding: 2px;
}
/* CHAT-MOBILE: list OR messages. .chat_panel_sidebar is CpSidebar's root, which also carries
   this component's scope attribute, so these rules outrank its own width: 220px. */
@media (max-width: 768px) {
  .chat_panel_chat_panel_wrapper:not(.chat_panel_show_messages) .chat_panel_sidebar { width: 100%; }
  .chat_panel_chat_panel_wrapper:not(.chat_panel_show_messages) .chat_panel_main { display: none; }
  .chat_panel_chat_panel_wrapper.chat_panel_show_messages .chat_panel_sidebar { display: none; }
}
</style>

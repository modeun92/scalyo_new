<template>
  <div class="cp-wrapper">
    <CpSidebar
      :show-close="showClose"
      @select="handleSelect"
      @create-channel="showCreateChannel = true"
      @open-dm="handleOpenDm"
      @close="$emit('close')"
    />
    <div class="cp-main">
      <!-- C-07: the store's failures are displayed (the panel used to be mute) -->
      <div v-if="store.lastError" class="cp-error-toast">
        <span>{{ t('chat_err_' + store.lastError) }}</span>
        <button class="cp-error-close" @click="store.clearError()">✕</button>
      </div>
      <CpMessages
        @rename-channel="handleRenameChannel"
        @create-task="showCreateTask = true"
      />
      <CpInput />
    </div>
    <CpSlideOvers
      :showCreateChannel="showCreateChannel"
      :showCreateTask="showCreateTask"
      :renamingChannel="renamingChannel"
      @close-create-channel="showCreateChannel = false"
      @close-create-task="showCreateTask = false"
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
const renamingChannel = ref(null)

function handleSelect(id) {
  store.setActive(id)
}

function handleOpenDm(userId) {
  store.openDm(userId)
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
.cp-wrapper {
  display: flex;
  width: 100%;
  height: 100%;
  border-radius: var(--radius-md);
  overflow: hidden;
  background: var(--bg-white);
}
.cp-main {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
}
.cp-error-toast {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 14px;
  background: rgba(239, 68, 68, 0.08);
  color: var(--red);
  font-size: 12px;
  border-bottom: 1px solid var(--border-light);
}
.cp-error-close {
  background: none;
  border: none;
  cursor: pointer;
  color: var(--red);
  font-size: 12px;
  padding: 2px;
}
</style>

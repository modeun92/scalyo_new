<template>
  <teleport to="body">
    <!-- Create Channel -->
    <div v-if="showCreateChannel" class="cp-overlay" @click.self="$emit('close-create-channel')">
      <div class="cp-slide">
        <h3>{{ t('chat_create_channel') }}</h3>
        <label class="cp-label">{{ t('chat_channel_name') }}</label>
        <input v-model="channelName" :placeholder="t('chat_channel_name_ph')" class="cp-field" />
        <label class="cp-label">{{ t('chat_channel_desc') }}</label>
        <input v-model="channelDesc" :placeholder="t('chat_channel_desc_ph')" class="cp-field" />
        <button class="cp-btn-primary" :disabled="!channelName.trim()" @click="createChannel">{{ t('create') }}</button>
      </div>
    </div>

    <!-- Rename Channel -->
    <div v-if="renamingChannel" class="cp-overlay" @click.self="$emit('close-rename')">
      <div class="cp-slide">
        <h3>{{ t('chat_rename_channel') }}</h3>
        <label class="cp-label">{{ t('chat_new_name') }}</label>
        <input v-model="renameName" :placeholder="renamingChannel?.name" class="cp-field" />
        <button class="cp-btn-primary" :disabled="!renameName.trim()" @click="renameChannel">{{ t('chat_save') }}</button>
      </div>
    </div>

    <!-- Create Task -->
    <div v-if="showCreateTask" class="cp-overlay" @click.self="$emit('close-create-task')">
      <div class="cp-slide">
        <h3>{{ t('chat_create_task') }}</h3>
        <label class="cp-label">{{ t('chat_task_title') }}</label>
        <input v-model="taskTitle" class="cp-field" />
        <label class="cp-label">{{ t('chat_task_priority') }}</label>
        <select v-model="taskPriority" class="cp-field">
          <option value="low">{{ t('chat_priority_low') }}</option>
          <option value="medium">{{ t('chat_priority_medium') }}</option>
          <option value="high">{{ t('chat_priority_high') }}</option>
          <option value="critical">{{ t('chat_priority_critical') }}</option>
        </select>
        <label class="cp-label">{{ t('chat_task_due') }}</label>
        <input v-model="taskDue" type="date" class="cp-field" />
        <button class="cp-btn-primary" :disabled="!taskTitle.trim()" @click="createTask">{{ t('create') }}</button>
      </div>
    </div>
  </teleport>
</template>

<script setup>
import { ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useChatStore } from '@/stores/chat'
import { useTaskStore } from '@/stores/tasks'

const props = defineProps({
  showCreateChannel: Boolean,
  showCreateTask: Boolean,
  renamingChannel: { type: Object, default: null }
})

defineEmits(['close-create-channel', 'close-create-task', 'close-rename'])

const { t } = useI18n()
const chatStore = useChatStore()
const tasksStore = useTaskStore()

const channelName = ref('')
const channelDesc = ref('')
const renameName = ref('')
const taskTitle = ref('')
const taskPriority = ref('medium')
const taskDue = ref('')

watch(() => props.renamingChannel, (ch) => { renameName.value = ch?.name || '' })

async function createChannel() {
  try {
    await chatStore.createChannel(channelName.value.trim(), channelDesc.value.trim())
    channelName.value = ''
    channelDesc.value = ''
  } catch (e) { console.error('Create channel failed:', e.message || e) }
}

async function renameChannel() {
  if (!props.renamingChannel) return
  try {
    await chatStore.updateChannel(props.renamingChannel.id, { name: renameName.value.trim() })
    renameName.value = ''
  } catch (e) { console.error('Rename channel failed:', e.message || e) }
}

async function createTask() {
  try {
    const task = { title: taskTitle.value.trim(), priority: taskPriority.value, dueDate: taskDue.value || null }
    await tasksStore.addTask(task)
    taskTitle.value = ''
    taskPriority.value = 'medium'
    taskDue.value = ''
  } catch (e) { console.error('Create task failed:', e.message || e) }
}
</script>

<style scoped>
.cp-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.3); z-index: 1000; display: flex; justify-content: flex-end; }
.cp-slide { width: 380px; max-width: 100vw; background: var(--bg-card); padding: 24px; display: flex; flex-direction: column; gap: 10px; box-shadow: var(--shadow-md); overflow-y: auto; }
.cp-slide h3 { font-size: 16px; font-weight: 600; color: var(--text); margin: 0 0 8px; }
.cp-label { font-size: 12px; font-weight: 500; color: var(--text-secondary); }
.cp-field { padding: 8px 10px; border: 1px solid var(--border); border-radius: var(--radius-sm); font-size: 13px; background: var(--bg); color: var(--text); outline: none; }
.cp-field:focus { border-color: var(--purple); }
.cp-btn-primary { padding: 8px 16px; border: none; border-radius: var(--radius-sm); background: var(--purple); color: #fff; font-size: 13px; font-weight: 500; cursor: pointer; margin-top: 8px; }
.cp-btn-primary:disabled { opacity: 0.4; cursor: not-allowed; }
.cp-btn-primary:not(:disabled):hover { background: var(--purple-dark); }
</style>

<template>
  <teleport to="body">
    <!-- Create Channel -->
    <div v-if="showCreateChannel" class="chat_panel_overlay" @click.self="$emit('close-create-channel')">
      <div class="chat_panel_slide">
        <h3>{{ t('chat_create_channel') }}</h3>
        <label class="chat_panel_label">{{ t('chat_channel_name') }}</label>
        <input v-model="channelName" :placeholder="t('chat_channel_name_ph')" class="chat_panel_field" />
        <label class="chat_panel_label">{{ t('chat_channel_desc') }}</label>
        <input v-model="channelDesc" :placeholder="t('chat_channel_desc_ph')" class="chat_panel_field" />
        <button class="chat_panel_button_primary" :disabled="!channelName.trim()" @click="createChannel">{{ t('create') }}</button>
      </div>
    </div>

    <!-- Rename Channel -->
    <div v-if="renamingChannel" class="chat_panel_overlay" @click.self="$emit('close-rename')">
      <div class="chat_panel_slide">
        <h3>{{ t('chat_rename_channel') }}</h3>
        <label class="chat_panel_label">{{ t('chat_new_name') }}</label>
        <input v-model="renameName" :placeholder="renamingChannel?.name" class="chat_panel_field" />
        <button class="chat_panel_button_primary" :disabled="!renameName.trim()" @click="renameChannel">{{ t('chat_save') }}</button>
      </div>
    </div>

    <!-- Create Task -->
    <div v-if="showCreateTask" class="chat_panel_overlay" @click.self="$emit('close-create-task')">
      <div class="chat_panel_slide">
        <h3>{{ t('chat_create_task') }}</h3>
        <!-- CHAT-TASK (03/10/2026): the task form's own labels and priority scale (the KanbanView
             form), not a chat copy of them - see createTask() below. -->
        <label class="chat_panel_label">{{ t('smart_matrix_task_title') }}</label>
        <input v-model="taskTitle" class="chat_panel_field" />
        <label class="chat_panel_label">{{ t('smart_matrix_task_desc') }}</label>
        <textarea v-model="taskDescription" rows="4" class="chat_panel_field chat_panel_field_textarea"></textarea>
        <label class="chat_panel_label">{{ t('smart_matrix_task_priority') }}</label>
        <select v-model="taskPriority" class="chat_panel_field">
          <option value="urgent_important">{{ t('smart_matrix_priority_urgent_important') }}</option>
          <option value="important">{{ t('smart_matrix_priority_important') }}</option>
          <option value="urgent">{{ t('smart_matrix_priority_urgent') }}</option>
          <option value="not_urgent">{{ t('smart_matrix_priority_not_urgent') }}</option>
        </select>
        <label class="chat_panel_label">{{ t('smart_matrix_task_due') }}</label>
        <input v-model="taskDue" type="date" class="chat_panel_field" />
        <div v-if="taskError" class="chat_panel_slide_error">{{ t('chat_err_create_task_failed') }}</div>
        <button class="chat_panel_button_primary" :disabled="!taskTitle.trim() || taskSaving" @click="createTask">{{ t('create') }}</button>
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
  // CHAT-TASK: the chat message the task is made from, or null.
  taskSource: { type: Object, default: null },
  renamingChannel: { type: Object, default: null }
})

const emit = defineEmits(['close-create-channel', 'close-create-task', 'close-rename'])

const { t } = useI18n()
const chatStore = useChatStore()
const tasksStore = useTaskStore()

const channelName = ref('')
const channelDesc = ref('')
const renameName = ref('')
const taskTitle = ref('')
const taskDescription = ref('')
const taskPriority = ref('important')
const taskDue = ref('')
const taskSaving = ref(false)
const taskError = ref(false)

watch(() => props.renamingChannel, (ch) => { renameName.value = ch?.name || '' })

// CHAT-TASK: opened from a message, the form starts from that message - its first line as
// the title, the whole text as the description - and from the task model's default priority.
watch(() => props.showCreateTask, (open) => {
  if (!open) return
  // A task shows plain text: the chat's ** and ` marks (CHAT-MARKDOWN) would land in it raw.
  const content = (props.taskSource?.content || '').replace(/\*\*|`/g, '').trim()
  taskTitle.value = content.split('\n')[0].slice(0, 120)
  taskDescription.value = content
  taskPriority.value = 'important'
  taskDue.value = ''
  taskError.value = false
})

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

// CHAT-TASK (03/10/2026): the priorities used to be low / medium / high / critical - values the
// task model does not know (it stores urgent_important / important / urgent / not_urgent). A
// task made here reached the Kanban with the fallback badge and sat in "not classified" on the
// priority matrix. The slide-over also never closed and ignored addTask()'s answer: it now
// closes on a created task only (D-14), and on a failure keeps the user's input (D-15).
async function createTask() {
  const title = taskTitle.value.trim()
  if (!title || taskSaving.value) return
  taskSaving.value = true
  taskError.value = false
  try {
    const created = await tasksStore.addTask({
      title,
      description: taskDescription.value.trim(),
      priority: taskPriority.value,
      dueDate: taskDue.value || null,
    })
    if (!created) { taskError.value = true; return }
    taskTitle.value = ''
    taskDescription.value = ''
    taskPriority.value = 'important'
    taskDue.value = ''
    emit('close-create-task')
  } catch (e) {
    console.error('Create task failed:', e.message || e)
    taskError.value = true
  } finally {
    taskSaving.value = false
  }
}
</script>

<style scoped>
.chat_panel_overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.3); z-index: 1000; display: flex; justify-content: flex-end; }
.chat_panel_slide { width: 380px; max-width: 100vw; background: var(--bg-card); padding: 24px; display: flex; flex-direction: column; gap: 10px; box-shadow: var(--shadow-md); overflow-y: auto; }
.chat_panel_slide h3 { font-size: 16px; font-weight: 600; color: var(--text); margin: 0 0 8px; }
.chat_panel_label { font-size: 12px; font-weight: 500; color: var(--text-secondary); }
.chat_panel_field { padding: 8px 10px; border: 1px solid var(--border); border-radius: var(--radius-sm); font-size: 13px; background: var(--bg); color: var(--text); outline: none; }
.chat_panel_field:focus { border-color: var(--purple); }
.chat_panel_field_textarea { resize: vertical; font-family: inherit; line-height: 1.45; }
.chat_panel_slide_error { font-size: 12px; color: var(--red); background: var(--red-bg); padding: 6px 10px; border-radius: var(--radius-sm); }
.chat_panel_button_primary { padding: 8px 16px; border: none; border-radius: var(--radius-sm); background: var(--purple); color: #fff; font-size: 13px; font-weight: 500; cursor: pointer; margin-top: 8px; }
.chat_panel_button_primary:disabled { opacity: 0.4; cursor: not-allowed; }
.chat_panel_button_primary:not(:disabled):hover { background: var(--purple-dark); }
</style>

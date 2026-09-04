<template>
  <div class="kanban_view">
    <div class="kpis_builder_header">
      <h1>📋 {{ t('sm_kanban_title') }}</h1>
      <div class="kpis_builder_header_actions">
        <div v-if="resetStep === 0">
          <button class="button_danger_outline" @click="resetStep = 1">{{ t('sm_reset_all') }}</button>
        </div>
        <div v-else-if="resetStep === 1" class="reset_confirm">
          <span class="reset_message">{{ t('sm_reset_step1') }}</span>
          <button class="button_danger_outline" @click="resetStep = 2">{{ t('sm_reset_confirm') }}</button>
          <button class="button_outline" @click="resetStep = 0">{{ t('sm_reset_cancel') }}</button>
        </div>
        <div v-else-if="resetStep === 2" class="reset_confirm">
          <span class="reset_message warn">{{ t('sm_reset_step2') }}</span>
          <button class="button_danger" @click="doResetAll">{{ t('sm_reset_confirm') }}</button>
          <button class="button_outline" @click="resetStep = 0">{{ t('sm_reset_cancel') }}</button>
        </div>
        <button class="button_primary" @click="openCreate">{{ t('sm_new_task') }}</button>
      </div>
    </div>

    <div class="kpis_builder_board">
      <div v-for="col in columns" :key="col.key" class="kpis_builder_column" :class="col.key">
        <div class="kanban_column_header">
          <span class="kanban_column_dot" :class="col.key" />
          <strong>{{ t(col.label) }}</strong>
          <span class="kanban_column_count">{{ colTasks(col.key).length }}</span>
        </div>
        <div class="kanban_column_body" @dragover.prevent="onDragOver($event)" @drop="onDrop($event, col.key)" :class="{ 'drag_over': dragOverCol === col.key }">
          <div
            v-for="task in colTasks(col.key)"
            :key="task.id"
            class="kpis_builder_card"
            :class="'priority_' + priorityLevel(task.priority)"
            draggable="true"
            @dragstart="onDragStart($event, task)"
            @dragend="dragOverCol = null"
            @click="openEdit(task)"
          >
            <div class="kanban_card_top">
              <strong>{{ task.title }}</strong>
              <span class="priority_badge" :class="'playbook_' + priorityLevel(task.priority)">{{ priorityLabel(task.priority) }}</span>
            </div>
            <div class="kanban_card_meta">
              <span v-if="task.clientId" class="kanban_card_client">{{ clientName(task.clientId) }}</span>
              <span v-if="task.projectId" class="kanban_card_project" :style="{ borderColor: projectColor(task.projectId) }">{{ projectName(task.projectId) }}</span>
            </div>
            <div class="kanban_card_footer">
              <div class="kanban_card_assignee_wrapper">
                <span class="kanban_card_avatar">{{ assigneeName(task.assignee)?.[0] || '?' }}</span>
                <span class="kanban_card_assignee">{{ assigneeName(task.assignee) }}</span>
              </div>
              <span class="kanban_card_due" :class="{ late: isOverdue(task) }">{{ task.dueDate ? fmtDate(task.dueDate) : '' }}</span>
            </div>
            <div v-if="task.subtasks?.length" class="kanban_card_subtasks">
              <div class="kanban_card_sub_bar"><div class="kanban_card_sub_fill" :style="{ width: (task.subtasks.filter(s => s.done).length / task.subtasks.length * 100) + '%' }" /></div>
              <span>{{ task.subtasks.filter(s => s.done).length }}/{{ task.subtasks.length }}</span>
            </div>
          </div>
          <!-- Drop zone -->
          <div
            class="kpis_builder_dropzone"
            @dragover.prevent
            @drop="onDrop($event, col.key)"
          >
            <span v-if="!colTasks(col.key).length">{{ t('sm_no_tasks') }}</span>
          </div>
        </div>
      </div>
    </div>

    <!-- Slide-over new/edit task -->
    <SlideOver :open="slideOpen" :title="editId ? t('edit') : t('sm_new_task')" @close="slideOpen = false">
      <form @submit.prevent="saveTask" class="slideover_form">
        <div class="field_group"><label>{{ t('sm_task_title') }} *</label><input v-model="form.title" required class="field_input" /></div>
        <div class="field_group"><label>{{ t('sm_task_desc') }}</label><textarea v-model="form.description" class="field_input textarea" rows="2" /></div>
        <div class="field_row">
          <div class="field_group"><label>{{ t('sm_task_project') }}</label>
            <select v-model="form.projectId" class="field_input"><option :value="null">—</option><option v-for="p in tasks.projects" :key="p.id" :value="p.id">{{ p.name }}</option></select>
          </div>
          <div class="field_group"><label>{{ t('sm_task_client') }}</label>
            <select v-model="form.clientId" class="field_input"><option :value="null">—</option><option v-for="c in clients.clients" :key="c.id" :value="c.id">{{ c.name }}</option></select>
          </div>
        </div>
        <div class="field_row">
          <div class="field_group"><label>{{ t('sm_task_assignee') }}</label>
            <select v-model="form.assignee" class="field_input"><option value="">—</option><option v-for="m in team.assignableMembers" :key="m.id" :value="m.id">{{ m.name }}</option></select>
          </div>
          <div class="field_group"><label>{{ t('sm_task_due') }}</label><input v-model="form.dueDate" type="date" class="field_input" /></div>
        </div>
        <div class="field_group"><label>{{ t('sm_task_priority') }}</label>
          <select v-model="form.priority" class="field_input">
            <option value="urgent_important">{{ t('sm_priority_urgent_important') }}</option>
            <option value="important">{{ t('sm_priority_important') }}</option>
            <option value="urgent">{{ t('sm_priority_urgent') }}</option>
            <option value="not_urgent">{{ t('sm_priority_not_urgent') }}</option>
          </select>
        </div>
        <div class="form_actions">
          <button v-if="editId" type="button" class="button_danger" @click="deleteTask">{{ t('delete') }}</button>
          <div style="flex:1" />
          <button type="button" class="button_outline" @click="slideOpen = false">{{ t('cancel') }}</button>
          <button type="submit" class="button_primary">{{ editId ? t('save') : t('create') }}</button>
        </div>
      </form>
    </SlideOver>
  </div>
</template>

<script setup>
import { ref, reactive } from 'vue'
import { useI18n } from 'vue-i18n'
import { useTaskStore } from '@/stores/tasks'
import { useClientStore } from '@/stores/clients'
import { useTeamStore } from '@/stores/team'
import SlideOver from '@/components/SlideOver.vue'
import { fmtDate } from '@/lib/formatters' // DATE-RAW: no more raw "2026-09-15" on the cards

const { t } = useI18n({ useScope: 'global' })
const tasks = useTaskStore()
const clients = useClientStore()
const team = useTeamStore()

const slideOpen = ref(false)
const editId = ref(null)
const resetStep = ref(0)
let draggedTask = null
const dragOverCol = ref(null)

function doResetAll() {
  tasks.resetAll()
  resetStep.value = 0
}

const columns = [
  { key: 'todo', label: 'sm_col_todo' },
  { key: 'in_progress', label: 'sm_col_progress' },
  { key: 'blocked', label: 'sm_col_blocked' },
  { key: 'done', label: 'sm_col_done' },
]

// MIN-i18n: default assignee '' (unassigned) — 'tm1' was a phantom member from the mock era
const initForm = () => ({ title: '', description: '', projectId: null, clientId: null, assignee: '', dueDate: '', priority: 'important' })
const form = reactive(initForm())

function colTasks(status) { return tasks.tasks.filter(t => t.status === status) }
function clientName(id) { return clients.clients.find(c => c.id === id)?.name || '' }
function projectName(id) { return tasks.projects.find(p => p.id === id)?.name || '' }
function projectColor(id) { return tasks.projects.find(p => p.id === id)?.color || '#7c3aed' }
function assigneeName(id) { return team.memberName(id) }
function isOverdue(task) { return task.status !== 'done' && task.dueDate < new Date().toISOString().slice(0, 10) }

function priorityLevel(p) {
  const map = { urgent_important: 'critical', important: 'high', urgent: 'medium', not_urgent: 'low' }
  return map[p] || 'low'
}
function priorityLabel(p) {
  // PRIORITY-LABEL (29/08): the card displays the SAME labels as the form
  // (sm_priority_*, keys × 3 languages) — the generic sm_badge_* scale made the card
  // say "High" while the select said "Important". Value outside the scale
  // (e.g. 'medium', separate PRIO-MEDIUM finding): fallback unchanged.
  const map = { urgent_important: t('sm_priority_urgent_important'), important: t('sm_priority_important'), urgent: t('sm_priority_urgent'), not_urgent: t('sm_priority_not_urgent') }
  return map[p] || t('sm_badge_1')
}

function onDragStart(e, task) { draggedTask = task; e.dataTransfer.effectAllowed = 'move' }
function onDragOver(e) { e.preventDefault(); const col = e.currentTarget.closest('.kb-col'); if (col) dragOverCol.value = col.classList[1] }
function onDrop(e, newStatus) { if (draggedTask) { tasks.moveTask(draggedTask.id, newStatus); draggedTask = null; dragOverCol.value = null } }

function openCreate() { editId.value = null; Object.assign(form, initForm()); slideOpen.value = true }
function openEdit(task) {
  editId.value = task.id
  Object.assign(form, { title: task.title, description: task.description || '', projectId: task.projectId, clientId: task.clientId, assignee: task.assignee, dueDate: task.dueDate, priority: task.priority })
  slideOpen.value = true
}

function saveTask() {
  if (editId.value) {
    tasks.updateTask(editId.value, { ...form })
  } else {
    tasks.addTask({ ...form })
  }
  slideOpen.value = false
}

function deleteTask() {
  if (editId.value) { tasks.deleteTask(editId.value); slideOpen.value = false }
}
</script>

<style scoped>
.kanban_view { max-width: 1200px; }
.kpis_builder_header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; }
.kpis_builder_header h1 { font-size: 1.5rem; font-weight: 800; }
.button_primary { background: var(--purple); color: #fff; border: none; padding: 9px 18px; border-radius: var(--radius-sm); font-size: 0.85rem; font-weight: 600; cursor: pointer; }
.button_primary:hover { background: var(--purple-dark); }
.button_outline { background: var(--bg-card); color: var(--text-secondary); border: 1px solid var(--border); padding: 9px 18px; border-radius: var(--radius-sm); font-size: 0.85rem; cursor: pointer; }
.button_danger { background: var(--red-bg); color: var(--red); border: 1px solid var(--red-border); padding: 9px 18px; border-radius: var(--radius-sm); font-size: 0.85rem; cursor: pointer; font-weight: 600; }

.kpis_builder_board { display: grid; grid-template-columns: repeat(4, 1fr); gap: 14px; align-items: start; }
.kpis_builder_column { border-radius: var(--radius-md); min-height: 300px; }
.kpis_builder_column.todo { background: var(--bg-hover); }
.kpis_builder_column.in_progress { background: var(--amber-bg); }
.kpis_builder_column.blocked { background: var(--red-bg); }
.kpis_builder_column.done { background: var(--green-bg); }
.kanban_column_header { display: flex; align-items: center; gap: 8px; padding: 14px 14px 10px; }
.kanban_column_dot { width: 8px; height: 8px; border-radius: 50%; }
.kanban_column_dot.todo { background: var(--text-muted); }
.kanban_column_dot.in_progress { background: var(--blue); }
.kanban_column_dot.blocked { background: var(--red); }
.kanban_column_dot.done { background: var(--green); }
.kanban_column_header strong { font-size: 0.82rem; }
.kanban_column_count { font-size: 0.68rem; background: rgba(0,0,0,0.06); padding: 1px 6px; border-radius: 4px; color: var(--text-muted); }
.kanban_column_body { padding: 0 10px 14px; }

.kpis_builder_card { background: var(--bg-card); border: 1px solid var(--border); border-radius: var(--radius-sm); padding: 12px; margin-bottom: 8px; cursor: grab; transition: all 0.15s; }
.kpis_builder_card:hover { box-shadow: var(--shadow-sm); transform: translateY(-1px); }
.kpis_builder_card:active { cursor: grabbing; }
/* Card priority border */
.kpis_builder_card.priority_critical { border-left: 3px solid var(--red); }
.kpis_builder_card.priority_high { border-left: 3px solid var(--amber); }
.kpis_builder_card.priority_medium { border-left: 3px solid var(--amber); }
.kpis_builder_card.priority_low { border-left: 3px solid var(--green); }

.kanban_card_top { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 8px; gap: 6px; }
.kanban_card_top strong { font-size: 0.82rem; flex: 1; }

/* Priority badge */
.priority_badge { font-size: 0.6rem; font-weight: 700; padding: 2px 7px; border-radius: 99px; white-space: nowrap; flex-shrink: 0; }
.playbook_critical { background: var(--red-bg); color: var(--red); }
.playbook_high { background: var(--amber-bg); color: var(--amber); }
.playbook_medium { background: var(--amber-bg); color: var(--amber); }
.playbook_low { background: var(--green-bg); color: var(--green); }

.kanban_card_meta { display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 6px; }
.kanban_card_client { font-size: 0.68rem; color: var(--purple); background: var(--purple-bg); padding: 1px 6px; border-radius: 4px; }
.kanban_card_project { font-size: 0.68rem; padding: 1px 6px; border-radius: 4px; border: 1px solid; }
.kanban_card_footer { display: flex; justify-content: space-between; align-items: center; }
.kanban_card_assignee_wrapper { display: flex; align-items: center; gap: 5px; }
.kanban_card_avatar { width: 18px; height: 18px; border-radius: 50%; background: var(--purple); color: #fff; display: flex; align-items: center; justify-content: center; font-size: 0.55rem; font-weight: 700; flex-shrink: 0; }
.kanban_card_assignee { font-size: 0.7rem; color: var(--text-muted); }
.kanban_card_due { font-size: 0.7rem; color: var(--text-muted); }
.kanban_card_due.late { color: var(--red); font-weight: 600; }
.kanban_card_subtasks { display: flex; align-items: center; gap: 6px; font-size: 0.68rem; color: var(--text-muted); margin-top: 6px; padding-top: 6px; border-top: 1px solid var(--border-light); }
.kanban_card_sub_bar { flex: 1; height: 3px; background: var(--border-light); border-radius: 2px; overflow: hidden; }
.kanban_card_sub_fill { height: 100%; background: var(--green); border-radius: 2px; }

.kpis_builder_dropzone { min-height: 40px; border: 2px dashed transparent; border-radius: var(--radius-sm); display: flex; align-items: center; justify-content: center; transition: all 0.2s; font-size: 0.78rem; color: var(--text-muted); }
.kpis_builder_dropzone:hover { border-color: var(--purple-border); background: var(--purple-bg); }
.kanban_column_body.drag_over { background: var(--purple-bg); border: 2px dashed var(--purple-border); border-radius: var(--radius-sm); }

.slideover_form { display: flex; flex-direction: column; gap: 14px; }
.field_group { display: flex; flex-direction: column; gap: 4px; }
.field_group label { font-size: 0.78rem; font-weight: 600; color: var(--text-secondary); }
.field_input { padding: 9px 12px; border: 1px solid var(--border); border-radius: var(--radius-sm); font-size: 0.85rem; outline: none; background: var(--bg-card); width: 100%; }
.field_input:focus { border-color: var(--purple); }
.textarea { resize: vertical; }
.field_row { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.form_actions { display: flex; gap: 10px; align-items: center; padding-top: 8px; border-top: 1px solid var(--border-light); }

.kpis_builder_header_actions { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.reset_confirm { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.reset_message { font-size: 0.82rem; color: var(--text-secondary); }
.reset_message.warn { color: var(--red); font-weight: 600; }
.button_danger { background: #ef4444; color: #fff; border: none; padding: 9px 18px; border-radius: var(--radius-sm); font-size: 0.85rem; font-weight: 600; cursor: pointer; transition: all 0.2s; }
.button_danger:hover { background: #dc2626; }
.button_danger_outline { background: none; color: #ef4444; border: 1px solid #ef4444; padding: 9px 18px; border-radius: var(--radius-sm); font-size: 0.85rem; font-weight: 600; cursor: pointer; transition: all 0.2s; }
.button_danger_outline:hover { background: var(--red-bg); }

@media (max-width: 900px) { .kpis_builder_board { grid-template-columns: repeat(2, 1fr); } }
@media (max-width: 600px) { .kpis_builder_board { grid-template-columns: 1fr; } .field_row { grid-template-columns: 1fr; } }
</style>

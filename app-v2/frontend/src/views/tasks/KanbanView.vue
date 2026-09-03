<template>
  <div class="kanban-view">
    <div class="kb-header">
      <h1>📋 {{ t('sm_kanban_title') }}</h1>
      <div class="kb-header-actions">
        <div v-if="resetStep === 0">
          <button class="btn-danger-outline" @click="resetStep = 1">{{ t('sm_reset_all') }}</button>
        </div>
        <div v-else-if="resetStep === 1" class="reset-confirm">
          <span class="reset-msg">{{ t('sm_reset_step1') }}</span>
          <button class="btn-danger-outline" @click="resetStep = 2">{{ t('sm_reset_confirm') }}</button>
          <button class="btn-outline" @click="resetStep = 0">{{ t('sm_reset_cancel') }}</button>
        </div>
        <div v-else-if="resetStep === 2" class="reset-confirm">
          <span class="reset-msg warn">{{ t('sm_reset_step2') }}</span>
          <button class="btn-danger" @click="doResetAll">{{ t('sm_reset_confirm') }}</button>
          <button class="btn-outline" @click="resetStep = 0">{{ t('sm_reset_cancel') }}</button>
        </div>
        <button class="btn-primary" @click="openCreate">{{ t('sm_new_task') }}</button>
      </div>
    </div>

    <div class="kb-board">
      <div v-for="col in columns" :key="col.key" class="kb-col" :class="col.key">
        <div class="kbc-header">
          <span class="kbc-dot" :class="col.key" />
          <strong>{{ t(col.label) }}</strong>
          <span class="kbc-count">{{ colTasks(col.key).length }}</span>
        </div>
        <div class="kbc-body" @dragover.prevent="onDragOver($event)" @drop="onDrop($event, col.key)" :class="{ 'drag-over': dragOverCol === col.key }">
          <div
            v-for="task in colTasks(col.key)"
            :key="task.id"
            class="kb-card"
            :class="'prio-' + priorityLevel(task.priority)"
            draggable="true"
            @dragstart="onDragStart($event, task)"
            @dragend="dragOverCol = null"
            @click="openEdit(task)"
          >
            <div class="kcard-top">
              <strong>{{ task.title }}</strong>
              <span class="prio-badge" :class="'pb-' + priorityLevel(task.priority)">{{ priorityLabel(task.priority) }}</span>
            </div>
            <div class="kcard-meta">
              <span v-if="task.clientId" class="kcard-client">{{ clientName(task.clientId) }}</span>
              <span v-if="task.projectId" class="kcard-project" :style="{ borderColor: projectColor(task.projectId) }">{{ projectName(task.projectId) }}</span>
            </div>
            <div class="kcard-footer">
              <div class="kcard-assignee-wrap">
                <span class="kcard-avatar">{{ assigneeName(task.assignee)?.[0] || '?' }}</span>
                <span class="kcard-assignee">{{ assigneeName(task.assignee) }}</span>
              </div>
              <span class="kcard-due" :class="{ late: isOverdue(task) }">{{ task.dueDate ? fmtDate(task.dueDate) : '' }}</span>
            </div>
            <div v-if="task.subtasks?.length" class="kcard-subtasks">
              <div class="kcard-sub-bar"><div class="kcard-sub-fill" :style="{ width: (task.subtasks.filter(s => s.done).length / task.subtasks.length * 100) + '%' }" /></div>
              <span>{{ task.subtasks.filter(s => s.done).length }}/{{ task.subtasks.length }}</span>
            </div>
          </div>
          <!-- Drop zone -->
          <div
            class="kb-dropzone"
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
      <form @submit.prevent="saveTask" class="sf">
        <div class="fg"><label>{{ t('sm_task_title') }} *</label><input v-model="form.title" required class="fi" /></div>
        <div class="fg"><label>{{ t('sm_task_desc') }}</label><textarea v-model="form.description" class="fi ta" rows="2" /></div>
        <div class="fr">
          <div class="fg"><label>{{ t('sm_task_project') }}</label>
            <select v-model="form.projectId" class="fi"><option :value="null">—</option><option v-for="p in tasks.projects" :key="p.id" :value="p.id">{{ p.name }}</option></select>
          </div>
          <div class="fg"><label>{{ t('sm_task_client') }}</label>
            <select v-model="form.clientId" class="fi"><option :value="null">—</option><option v-for="c in clients.clients" :key="c.id" :value="c.id">{{ c.name }}</option></select>
          </div>
        </div>
        <div class="fr">
          <div class="fg"><label>{{ t('sm_task_assignee') }}</label>
            <select v-model="form.assignee" class="fi"><option value="">—</option><option v-for="m in team.assignableMembers" :key="m.id" :value="m.id">{{ m.name }}</option></select>
          </div>
          <div class="fg"><label>{{ t('sm_task_due') }}</label><input v-model="form.dueDate" type="date" class="fi" /></div>
        </div>
        <div class="fg"><label>{{ t('sm_task_priority') }}</label>
          <select v-model="form.priority" class="fi">
            <option value="urgent_important">{{ t('sm_priority_urgent_important') }}</option>
            <option value="important">{{ t('sm_priority_important') }}</option>
            <option value="urgent">{{ t('sm_priority_urgent') }}</option>
            <option value="not_urgent">{{ t('sm_priority_not_urgent') }}</option>
          </select>
        </div>
        <div class="fa">
          <button v-if="editId" type="button" class="btn-danger" @click="deleteTask">{{ t('delete') }}</button>
          <div style="flex:1" />
          <button type="button" class="btn-outline" @click="slideOpen = false">{{ t('cancel') }}</button>
          <button type="submit" class="btn-primary">{{ editId ? t('save') : t('create') }}</button>
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
import { fmtDate } from '@/lib/formatters' // DATE-RAW : plus de « 2026-09-15 » brut sur les cartes

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

// MIN-i18n : assignee par defaut '' (non assigne) — 'tm1' etait un membre fantome de l'ere mock
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
  // PRIORITY-LABEL (29/08) : la carte affiche les MÊMES libellés que le formulaire
  // (sm_priority_*, clés ×3 langues) — l'échelle générique sm_badge_* faisait dire
  // « Élevé » à la carte quand le select disait « Important ». Valeur hors échelle
  // (ex. 'medium', constat PRIO-MEDIUM séparé) : fallback inchangé.
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
.kanban-view { max-width: 1200px; }
.kb-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; }
.kb-header h1 { font-size: 1.5rem; font-weight: 800; }
.btn-primary { background: var(--purple); color: #fff; border: none; padding: 9px 18px; border-radius: var(--radius-sm); font-size: 0.85rem; font-weight: 600; cursor: pointer; }
.btn-primary:hover { background: var(--purple-dark); }
.btn-outline { background: var(--bg-card); color: var(--text-secondary); border: 1px solid var(--border); padding: 9px 18px; border-radius: var(--radius-sm); font-size: 0.85rem; cursor: pointer; }
.btn-danger { background: var(--red-bg); color: var(--red); border: 1px solid var(--red-border); padding: 9px 18px; border-radius: var(--radius-sm); font-size: 0.85rem; cursor: pointer; font-weight: 600; }

.kb-board { display: grid; grid-template-columns: repeat(4, 1fr); gap: 14px; align-items: start; }
.kb-col { border-radius: var(--radius-md); min-height: 300px; }
.kb-col.todo { background: var(--bg-hover); }
.kb-col.in_progress { background: var(--amber-bg); }
.kb-col.blocked { background: var(--red-bg); }
.kb-col.done { background: var(--green-bg); }
.kbc-header { display: flex; align-items: center; gap: 8px; padding: 14px 14px 10px; }
.kbc-dot { width: 8px; height: 8px; border-radius: 50%; }
.kbc-dot.todo { background: var(--text-muted); }
.kbc-dot.in_progress { background: var(--blue); }
.kbc-dot.blocked { background: var(--red); }
.kbc-dot.done { background: var(--green); }
.kbc-header strong { font-size: 0.82rem; }
.kbc-count { font-size: 0.68rem; background: rgba(0,0,0,0.06); padding: 1px 6px; border-radius: 4px; color: var(--text-muted); }
.kbc-body { padding: 0 10px 14px; }

.kb-card { background: var(--bg-card); border: 1px solid var(--border); border-radius: var(--radius-sm); padding: 12px; margin-bottom: 8px; cursor: grab; transition: all 0.15s; }
.kb-card:hover { box-shadow: var(--shadow-sm); transform: translateY(-1px); }
.kb-card:active { cursor: grabbing; }
/* Card priority border */
.kb-card.prio-critical { border-left: 3px solid var(--red); }
.kb-card.prio-high { border-left: 3px solid var(--amber); }
.kb-card.prio-medium { border-left: 3px solid var(--amber); }
.kb-card.prio-low { border-left: 3px solid var(--green); }

.kcard-top { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 8px; gap: 6px; }
.kcard-top strong { font-size: 0.82rem; flex: 1; }

/* Priority badge */
.prio-badge { font-size: 0.6rem; font-weight: 700; padding: 2px 7px; border-radius: 99px; white-space: nowrap; flex-shrink: 0; }
.pb-critical { background: var(--red-bg); color: var(--red); }
.pb-high { background: var(--amber-bg); color: var(--amber); }
.pb-medium { background: var(--amber-bg); color: var(--amber); }
.pb-low { background: var(--green-bg); color: var(--green); }

.kcard-meta { display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 6px; }
.kcard-client { font-size: 0.68rem; color: var(--purple); background: var(--purple-bg); padding: 1px 6px; border-radius: 4px; }
.kcard-project { font-size: 0.68rem; padding: 1px 6px; border-radius: 4px; border: 1px solid; }
.kcard-footer { display: flex; justify-content: space-between; align-items: center; }
.kcard-assignee-wrap { display: flex; align-items: center; gap: 5px; }
.kcard-avatar { width: 18px; height: 18px; border-radius: 50%; background: var(--purple); color: #fff; display: flex; align-items: center; justify-content: center; font-size: 0.55rem; font-weight: 700; flex-shrink: 0; }
.kcard-assignee { font-size: 0.7rem; color: var(--text-muted); }
.kcard-due { font-size: 0.7rem; color: var(--text-muted); }
.kcard-due.late { color: var(--red); font-weight: 600; }
.kcard-subtasks { display: flex; align-items: center; gap: 6px; font-size: 0.68rem; color: var(--text-muted); margin-top: 6px; padding-top: 6px; border-top: 1px solid var(--border-light); }
.kcard-sub-bar { flex: 1; height: 3px; background: var(--border-light); border-radius: 2px; overflow: hidden; }
.kcard-sub-fill { height: 100%; background: var(--green); border-radius: 2px; }

.kb-dropzone { min-height: 40px; border: 2px dashed transparent; border-radius: var(--radius-sm); display: flex; align-items: center; justify-content: center; transition: all 0.2s; font-size: 0.78rem; color: var(--text-muted); }
.kb-dropzone:hover { border-color: var(--purple-border); background: var(--purple-bg); }
.kbc-body.drag-over { background: var(--purple-bg); border: 2px dashed var(--purple-border); border-radius: var(--radius-sm); }

.sf { display: flex; flex-direction: column; gap: 14px; }
.fg { display: flex; flex-direction: column; gap: 4px; }
.fg label { font-size: 0.78rem; font-weight: 600; color: var(--text-secondary); }
.fi { padding: 9px 12px; border: 1px solid var(--border); border-radius: var(--radius-sm); font-size: 0.85rem; outline: none; background: var(--bg-card); width: 100%; }
.fi:focus { border-color: var(--purple); }
.ta { resize: vertical; }
.fr { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.fa { display: flex; gap: 10px; align-items: center; padding-top: 8px; border-top: 1px solid var(--border-light); }

.kb-header-actions { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.reset-confirm { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.reset-msg { font-size: 0.82rem; color: var(--text-secondary); }
.reset-msg.warn { color: var(--red); font-weight: 600; }
.btn-danger { background: #ef4444; color: #fff; border: none; padding: 9px 18px; border-radius: var(--radius-sm); font-size: 0.85rem; font-weight: 600; cursor: pointer; transition: all 0.2s; }
.btn-danger:hover { background: #dc2626; }
.btn-danger-outline { background: none; color: #ef4444; border: 1px solid #ef4444; padding: 9px 18px; border-radius: var(--radius-sm); font-size: 0.85rem; font-weight: 600; cursor: pointer; transition: all 0.2s; }
.btn-danger-outline:hover { background: var(--red-bg); }

@media (max-width: 900px) { .kb-board { grid-template-columns: repeat(2, 1fr); } }
@media (max-width: 600px) { .kb-board { grid-template-columns: 1fr; } .fr { grid-template-columns: 1fr; } }
</style>

<template>
  <div class="pv">
    <!-- IMPORT -->
    <div v-if="showImport" class="import-section">
      <div class="import-project-select">
        <label>{{ t('imp_select_project') }}</label>
        <select v-model="importProjectId" class="mapping-select">
          <option v-for="p in taskStore.projects" :key="p.id" :value="p.id">{{ p.name }}</option>
        </select>
        <p class="import-hint">{{ t('imp_select_project_hint') }}</p>
      </div>
      <StandardImport :fields="taskFields" :on-import="handleBulkImport" />
    </div>

    <div class="pv-header">
      <h1>📁 {{ t('sm_projects_title') }}</h1>
      <div class="pv-actions">
        <button class="btn-outline" @click="showImport = !showImport">{{ t('import_btn_tasks') }}</button>
        <span class="scroll-hint">{{ t('sm_scroll_hint') }}</span>

        <!-- Reset global -->
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

        <button class="btn-primary" @click="slideOpen = true">{{ t('sm_new_project') }}</button>
      </div>
    </div>

    <!-- TABLE -->
    <div v-if="rows.length" class="table-outer">
      <div class="table-scroll" ref="scrollRef">
        <table class="pv-table">
          <thead>
            <tr>
              <th class="col-fix col-exp"></th>
                <th class="col-fix col-drag"></th>
              <th class="col-fix col-num">#</th>
              <th class="col-fix col-title">{{ t('sm_col_title') }}</th>
              <th class="col-scroll col-date">{{ t('sm_col_start') }}</th>
              <th class="col-scroll col-date">{{ t('sm_col_end') }}</th>
              <th class="col-scroll col-badge">{{ t('sm_col_urgency') }}</th>
              <th class="col-scroll col-badge">{{ t('sm_col_importance') }}</th>
              <th class="col-scroll col-badge">{{ t('sm_col_difficulty') }}</th>
              <th class="col-scroll col-status">{{ t('status_todo').split(' ')[0] }}</th>
              <th class="col-scroll col-check">{{ t('sm_col_finished') }}</th>
              <th class="col-scroll col-check">{{ t('sm_col_pended') }}</th>
              <th class="col-scroll col-num-input">{{ t('sm_col_actual') }}</th>
              <th class="col-scroll col-num-input">{{ t('sm_col_expected') }}</th>
              <th class="col-scroll col-num-input">{{ t('sm_col_min') }}</th>
              <th class="col-scroll col-num-input">{{ t('sm_col_max') }}</th>
              <th class="col-scroll col-num-input col-avg">{{ t('sm_col_avg') }}</th>
              <th class="col-scroll col-desc">{{ t('sm_col_desc') }}</th>
              <th class="col-scroll col-actions"></th>
            </tr>
          </thead>
          <tbody>
            <template v-for="(row, ri) in visibleRows" :key="row.id">
              <tr :class="['row-level-' + (row.level || 0), { 'row-project': row.type === 'project', 'row-done': row.finished, 'row-drag-over': dragOverRowId === row.id }]"
                @dragover.prevent="onRowDragOver($event, row)"
                @drop="onRowDrop($event, row)">
                <td class="col-fix col-exp">
                  <button v-if="row.hasChildren" class="exp-btn" @click="toggleExpand(row.id)">{{ expanded[row.id] ? '▾' : '▸' }}</button>
                </td>
                <td class="col-fix col-drag">
                  <span class="drag-handle" draggable="true" @dragstart="onRowDragStart($event, row, ri)" @dragend="onRowDragEnd">⠿</span>
                </td>
                <td class="col-fix col-num">{{ ri + 1 }}</td>
                <td class="col-fix col-title" :style="{ paddingLeft: (12 + (row.level || 0) * 24) + 'px' }">
                  <span v-if="row.type === 'project'" class="proj-dot" :style="{ background: row.color || '#7c3aed' }" />
                  <span v-if="editCell === row.id + '_title'" class="edit-wrap">
                    <input v-model="row.title" class="cell-input title-input" @keydown.enter="saveCell(row)" @keydown.tab.prevent="saveCell(row)" @keydown.escape="editCell = null" />
                  </span>
                  <span v-else class="cell-text title-text" :class="{ bold: row.type === 'project' }" @click="editCell = row.id + '_title'">{{ row.title || '—' }}</span>
                  <button v-if="row.type === 'project'" class="add-task-btn" @click.stop="addTaskToProject(row.id)">+ {{ t('sm_new_task') }}</button>
                  <button v-else class="add-sub-btn" @click.stop="addSubtaskToRow(row)">+</button>
                </td>
                <td class="col-scroll col-date" @click="editCell = row.id + '_startDate'">
                  <input v-if="editCell === row.id + '_startDate'" v-model="row.startDate" type="date" class="cell-input" @keydown.enter="saveCell(row)" @blur="saveCell(row)" />
                  <span v-else class="cell-text">{{ row.startDate ? fmtDate(row.startDate) : '—' }}</span>
                </td>
                <td class="col-scroll col-date" @click="editCell = row.id + '_endDate'">
                  <input v-if="editCell === row.id + '_endDate'" v-model="row.endDate" type="date" class="cell-input" @keydown.enter="saveCell(row)" @blur="saveCell(row)" />
                  <span v-else class="cell-text">{{ row.endDate ? fmtDate(row.endDate) : '—' }}</span>
                </td>
                <td class="col-scroll col-badge" @click="cycleBadge(row, 'urgency')">
                  <span class="badge-num" :class="'b-' + (row.urgency || 3)">{{ row.urgency || 3 }}</span>
                </td>
                <td class="col-scroll col-badge" @click="cycleBadge(row, 'importance')">
                  <span class="badge-num" :class="'b-' + (row.importance || 3)">{{ row.importance || 3 }}</span>
                </td>
                <td class="col-scroll col-badge" @click="cycleBadge(row, 'difficulty')">
                  <span class="badge-num" :class="'b-' + (row.difficulty || 3)">{{ row.difficulty || 3 }}</span>
                </td>
                <td class="col-scroll col-status">
                  <select v-model="row.status" class="cell-select" :class="'st-' + row.status" @change="saveCell(row)">
                    <option value="todo">{{ t('status_todo') }}</option>
                    <option value="in_progress">{{ t('status_in_progress') }}</option>
                    <option value="blocked">{{ t('status_blocked') }}</option>
                    <option value="done">{{ t('status_done') }}</option>
                  </select>
                </td>
                <td class="col-scroll col-check"><input type="checkbox" v-model="row.finished" @change="saveCell(row)" /></td>
                <td class="col-scroll col-check"><input type="checkbox" v-model="row.pended" @change="saveCell(row)" /></td>
                <td class="col-scroll col-num-input" @click="editCell = row.id + '_actualHours'">
                  <input v-if="editCell === row.id + '_actualHours'" v-model.number="row.actualHours" type="number" min="0" step="0.5" class="cell-input num" @keydown.enter="saveCell(row)" @blur="saveCell(row)" />
                  <span v-else class="cell-text num">{{ row.actualHours || '—' }}</span>
                </td>
                <td class="col-scroll col-num-input" @click="editCell = row.id + '_expectedHours'">
                  <input v-if="editCell === row.id + '_expectedHours'" v-model.number="row.expectedHours" type="number" min="0" step="0.5" class="cell-input num" @keydown.enter="saveCell(row)" @blur="saveCell(row)" />
                  <span v-else class="cell-text num">{{ row.expectedHours || '—' }}</span>
                </td>
                <td class="col-scroll col-num-input" @click="editCell = row.id + '_minHours'">
                  <input v-if="editCell === row.id + '_minHours'" v-model.number="row.minHours" type="number" min="0" step="0.5" class="cell-input num" @keydown.enter="saveCell(row)" @blur="saveCell(row)" />
                  <span v-else class="cell-text num">{{ row.minHours || '—' }}</span>
                </td>
                <td class="col-scroll col-num-input" @click="editCell = row.id + '_maxHours'">
                  <input v-if="editCell === row.id + '_maxHours'" v-model.number="row.maxHours" type="number" min="0" step="0.5" class="cell-input num" @keydown.enter="saveCell(row)" @blur="saveCell(row)" />
                  <span v-else class="cell-text num">{{ row.maxHours || '—' }}</span>
                </td>
                <td class="col-scroll col-num-input col-avg">
                  <span class="cell-text num avg">{{ avgHours(row) }}</span>
                </td>
                <td class="col-scroll col-desc" @click="editCell = row.id + '_description'">
                  <input v-if="editCell === row.id + '_description'" v-model="row.description" class="cell-input" @keydown.enter="saveCell(row)" @blur="saveCell(row)" />
                  <span v-else class="cell-text desc">{{ row.description || '—' }}</span>
                </td>
                <td class="col-scroll col-actions">
                  <!-- Double validation delete inline -->
                  <template v-if="deleteConfirmId === row.id">
                    <div class="delete-inline">
                      <span class="del-msg">{{ row.type === 'project' ? t('sm_delete_project_inline') : t('sm_delete_task_confirm') }}</span>
                      <button class="btn-del-ok" @click="confirmDelete(row)">✓</button>
                      <button class="btn-del-cancel" @click="deleteConfirmId = null">✕</button>
                    </div>
                  </template>
                  <template v-else-if="deleteConfirm2Id === row.id">
                    <div class="delete-inline warn">
                      <span class="del-msg warn">{{ t('sm_delete_project_confirm2') }}</span>
                      <button class="btn-del-ok" @click="finalDelete(row)">✓</button>
                      <button class="btn-del-cancel" @click="deleteConfirm2Id = null">✕</button>
                    </div>
                  </template>
                  <template v-else>
                    <button class="btn-delete" @click="deleteConfirmId = row.id" :title="t('delete')">🗑</button>
                  </template>
                </td>
              </tr>
            </template>
            <!-- Totals row -->
            <tr class="row-totals">
              <td class="col-fix col-exp"></td>
              <td class="col-fix col-num"></td>
              <td class="col-fix col-title"><strong>{{ t('sm_totals') }}</strong></td>
              <td class="col-scroll col-date"></td>
              <td class="col-scroll col-date"></td>
              <td class="col-scroll col-badge"></td>
              <td class="col-scroll col-badge"></td>
              <td class="col-scroll col-badge"></td>
              <td class="col-scroll col-status"></td>
              <td class="col-scroll col-check">{{ totals.finished }}/{{ totals.total }}</td>
              <td class="col-scroll col-check"></td>
              <td class="col-scroll col-num-input"><strong>{{ totals.actual }}</strong></td>
              <td class="col-scroll col-num-input"><strong>{{ totals.expected }}</strong></td>
              <td class="col-scroll col-num-input"><strong>{{ totals.min }}</strong></td>
              <td class="col-scroll col-num-input"><strong>{{ totals.max }}</strong></td>
              <td class="col-scroll col-num-input col-avg"><strong>{{ totals.avg }}</strong></td>
              <td class="col-scroll col-desc"></td>
              <td class="col-scroll col-actions"></td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- Empty -->
    <div v-else class="pv-empty">
      <div class="empty-icon">📁</div>
      <h3>{{ t('sm_no_projects') }}</h3>
      <button class="btn-primary" @click="slideOpen = true">{{ t('sm_new_project') }}</button>
    </div>

    <!-- Slide-over new project -->
    <SlideOver :open="slideOpen" :title="t('sm_new_project')" @close="slideOpen = false">
      <form @submit.prevent="createProject" class="sf">
        <div class="fg"><label>{{ t('sm_project_name') }} *</label><input v-model="newName" required class="fi" /></div>
        <div class="fg"><label>{{ t('sm_project_color') }}</label>
          <div class="color-picks"><button v-for="c in colors" :key="c" type="button" class="cpick" :class="{ active: newColor === c }" :style="{ background: c }" @click="newColor = c" /></div>
        </div>
        <div class="fa">
          <button type="button" class="btn-outline" @click="slideOpen = false">{{ t('cancel') }}</button>
          <button type="submit" class="btn-primary">{{ t('create') }}</button>
        </div>
      </form>
    </SlideOver>
  </div>
</template>

<script setup>
import { ref, reactive, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useTaskStore } from '@/stores/tasks'
import SlideOver from '@/components/SlideOver.vue'
import StandardImport from '@/components/import/StandardImport.vue'
import { taskFields } from '@/config/importFields.js'
import { fmtDate } from '@/lib/formatters' // DATE-RAW : cellules en lecture formatées, l'input date reste ISO

const { t } = useI18n({ useScope: 'global' })
const taskStore = useTaskStore()

const slideOpen = ref(false)
const newName = ref('')
const newColor = ref('#7c3aed')
const editCell = ref(null)
const expanded = reactive({})
const resetStep = ref(0)
const deleteConfirmId = ref(null)
const deleteConfirm2Id = ref(null)
const showImport = ref(false)
const importProjectId = ref('')
const colors = ['#7c3aed', '#3b82f6', '#10b981', '#ef4444', '#f59e0b', '#ec4899', '#8b5cf6', '#06b6d4']

var handleBulkImport = async function (rows) {
  var pid = importProjectId.value || (taskStore.projects[0]?.id || '')
  var count = 0
  var errors = 0
  for (var i = 0; i < rows.length; i++) {
    try {
      rows[i].projectId = pid
      var result = await taskStore.addTask(rows[i])
      if (result) count++
      else errors++
    } catch (e) {
      errors++
    }
  }
  if (count > 0) showImport.value = false
  return count
}

// Build flat rows from store — projects + their tasks
const rows = computed(() => {
  const result = []
  for (const project of taskStore.projects) {
    const p = { ...project, type: 'project', level: 0 }
    const projectTasks = taskStore.tasks.filter(t => t.projectId === project.id)
    p.hasChildren = projectTasks.length > 0
    result.push(p)
    if (expanded[project.id] !== false) {
      for (const task of projectTasks) {
        const taskRow = { ...task, type: task.type || 'task', level: task.level || 1 }
        const subs = taskStore.tasks.filter(t => t.parentId === task.id)
        taskRow.hasChildren = subs.length > 0
        result.push(taskRow)
        if (expanded[task.id]) {
          for (const sub of subs) {
            result.push({ ...sub, type: 'subtask', level: sub.level || 2, hasChildren: false })
          }
        }
      }
    }
  }
  return result
})

const visibleRows = computed(() => rows.value)

function toggleExpand(id) {
  expanded[id] = expanded[id] === false ? true : false
}

function saveCell(row) {
  editCell.value = null
  if (row.type === 'project') {
    taskStore.updateProject ? taskStore.updateProject(row.id, row) : null
  } else {
    taskStore.updateTask(row.id, {
      title: row.title,
      status: row.status,
      startDate: row.startDate,
      endDate: row.endDate,
      urgency: row.urgency,
      importance: row.importance,
      difficulty: row.difficulty,
      finished: row.finished,
      pended: row.pended,
      actualHours: row.actualHours,
      expectedHours: row.expectedHours,
      minHours: row.minHours,
      maxHours: row.maxHours,
      description: row.description,
    })
  }
}

function cycleBadge(row, field) {
  row[field] = ((row[field] || 3) % 5) + 1
  saveCell(row)
}

function avgHours(row) {
  if (row.minHours && row.maxHours) return ((row.minHours + row.maxHours) / 2).toFixed(1)
  return '—'
}

const totals = computed(() => {
  const allTasks = rows.value.filter(r => r.type !== 'project')
  return {
    total: allTasks.length,
    finished: allTasks.filter(r => r.finished).length,
    actual: allTasks.reduce((s, r) => s + (r.actualHours || 0), 0),
    expected: allTasks.reduce((s, r) => s + (r.expectedHours || 0), 0),
    min: allTasks.reduce((s, r) => s + (r.minHours || 0), 0),
    max: allTasks.reduce((s, r) => s + (r.maxHours || 0), 0),
    avg: (() => {
      const min = allTasks.reduce((s, r) => s + (r.minHours || 0), 0)
      const max = allTasks.reduce((s, r) => s + (r.maxHours || 0), 0)
      return ((min + max) / 2).toFixed(1)
    })(),
  }
})

function addTaskToProject(projectId) {
  const newId = 't_' + Date.now()
  taskStore.addTask({
    id: newId,
    title: '',
    projectId,
    parentId: null,
    level: 1,
    type: 'task',
  })
  expanded[projectId] = true
  editCell.value = newId + '_title'
}

function addSubtaskToRow(parentRow) {
  const newId = 'st_' + Date.now()
  taskStore.addTask({
    id: newId,
    title: '',
    projectId: parentRow.projectId || null,
    parentId: parentRow.id,
    level: (parentRow.level || 1) + 1,
    type: 'subtask',
  })
  taskStore.updateTask(parentRow.id, { hasChildren: true })
  expanded[parentRow.id] = true
  editCell.value = newId + '_title'
}

function confirmDelete(row) {
  deleteConfirmId.value = null
  deleteConfirm2Id.value = row.id
}

function finalDelete(row) {
  deleteConfirm2Id.value = null
  if (row.type === 'project') {
    taskStore.deleteProject(row.id)
  } else {
    taskStore.deleteTask(row.id)
  }
}

function doResetAll() {
  taskStore.resetAll()
  resetStep.value = 0
}


const draggedRow = ref(null)
const draggedRowIndex = ref(null)
const dragOverRowId = ref(null)

function onRowDragStart(e, row, index) {
  draggedRow.value = row
  draggedRowIndex.value = index
  e.dataTransfer.effectAllowed = 'move'
  e.dataTransfer.setData('text/plain', row.id)
}

function onRowDragEnd() {
  draggedRow.value = null
  draggedRowIndex.value = null
  dragOverRowId.value = null
}

function onRowDragOver(e, targetRow) {
  e.preventDefault()
  if (draggedRow.value && draggedRow.value.id !== targetRow.id) {
    dragOverRowId.value = targetRow.id
  }
}

function onRowDrop(e, targetRow) {
  e.preventDefault()
  if (!draggedRow.value || draggedRow.value.id === targetRow.id) return
  
  const src = draggedRow.value
  
  // If dragging a task to a different project
  if (src.type !== 'project' && targetRow.type === 'project' && src.projectId !== targetRow.id) {
    taskStore.updateTask(src.id, { projectId: targetRow.id })
  }
  
  // If dragging a task within same project (reorder)
  if (src.type !== 'project' && targetRow.type !== 'project') {
    // Swap status if different columns conceptually
    if (targetRow.projectId && src.projectId !== targetRow.projectId) {
      taskStore.updateTask(src.id, { projectId: targetRow.projectId })
    }
  }
  
  dragOverRowId.value = null
  draggedRow.value = null
}

function createProject() {
  taskStore.addProject({
    name: newName.value,
    color: newColor.value,
    title: newName.value,
  })
  newName.value = ''
  slideOpen.value = false
}
</script>

<style scoped>
.pv { max-width: 100%; }
.pv-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; flex-wrap: wrap; gap: 12px; }
.pv-header h1 { font-size: 1.5rem; font-weight: 800; }
.pv-actions { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.scroll-hint { font-size: 0.72rem; color: var(--text-muted); }
.btn-primary { background: var(--purple); color: #fff; border: none; padding: 9px 18px; border-radius: var(--radius-sm); font-size: 0.85rem; font-weight: 600; cursor: pointer; }
.btn-primary:hover { background: var(--purple-dark); }
.btn-outline { background: var(--bg-card); color: var(--text-secondary); border: 1px solid var(--border); padding: 9px 18px; border-radius: var(--radius-sm); font-size: 0.85rem; cursor: pointer; }
.btn-danger { background: #ef4444; color: #fff; border: none; padding: 9px 18px; border-radius: var(--radius-sm); font-size: 0.85rem; font-weight: 600; cursor: pointer; }
.btn-danger:hover { background: #dc2626; }
.btn-danger-outline { background: none; color: #ef4444; border: 1px solid #ef4444; padding: 9px 18px; border-radius: var(--radius-sm); font-size: 0.85rem; font-weight: 600; cursor: pointer; }
.btn-danger-outline:hover { background: #fef2f2; }
.reset-confirm { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.reset-msg { font-size: 0.78rem; color: var(--text-secondary); }
.reset-msg.warn { color: #ef4444; font-weight: 600; }

.table-outer { background: var(--bg-card); border: 1px solid var(--border); border-radius: var(--radius-md); overflow: hidden; }
.table-scroll { overflow: auto; max-height: calc(100vh - 200px); }
.pv-table { width: max-content; min-width: 100%; border-collapse: separate; border-spacing: 0; font-size: 0.82rem; }
.pv-table thead th { padding: 10px 8px; font-size: 0.68rem; font-weight: 700; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.03em; border-bottom: 2px solid var(--border); white-space: nowrap; text-align: left; background: #f9fafb; position: sticky; top: 0; z-index: 20; }
.col-fix { position: sticky; z-index: 5; background: var(--bg-card); }
.col-exp { left: 24px; width: 32px; min-width: 32px; }
.col-num { left: 56px; width: 36px; min-width: 36px; text-align: center; color: var(--text-muted); }
.col-title { left: 92px; min-width: 220px; max-width: 300px; border-right: 2px solid var(--border); }
.pv-table thead th.col-fix { z-index: 30; background: #f9fafb; }
.pv-table thead th.col-title { border-right: 2px solid var(--border); }
.col-scroll { white-space: nowrap; position: relative; z-index: 1; }
.col-date { width: 110px; min-width: 110px; }
.col-badge { width: 70px; min-width: 70px; text-align: center; }
.col-status { width: 100px; min-width: 100px; }
.col-check { width: 60px; min-width: 60px; text-align: center; }
.col-num-input { width: 80px; min-width: 80px; text-align: right; }
.col-avg { background: rgba(124,58,237,0.03); }
.col-desc { width: 200px; min-width: 200px; }
.col-actions { width: 180px; min-width: 180px; position: relative; z-index: 2; }
.pv-table tbody tr { transition: background 0.1s; }
.pv-table tbody td { border-bottom: 1px solid var(--border-light); padding: 6px 8px; vertical-align: middle; }
.pv-table tbody tr:hover { background: rgba(0,0,0,0.015); }
.row-project { background: #f5f3ff; }
.row-project .col-fix { background: #f5f3ff; }
.row-project:hover .col-fix { background: #ede9fe; }
.row-level-2 { background: #fafafa; }
.row-level-2 .col-fix { background: #fafafa; }
.row-done { opacity: 0.55; }
tr:hover .col-fix { background: var(--bg-hover); }
.row-totals { background: var(--bg); font-weight: 600; border-top: 2px solid var(--border); }
.row-totals .col-fix { background: var(--bg-hover); }
.row-totals td { padding: 10px 8px; font-size: 0.78rem; }
.exp-btn { background: none; border: none; cursor: pointer; font-size: 0.75rem; color: var(--text-muted); padding: 2px 4px; border-radius: 4px; width: 100%; }
.exp-btn:hover { background: var(--bg-hover); color: var(--text); }
.proj-dot { width: 8px; height: 8px; border-radius: 50%; display: inline-block; margin-right: 6px; vertical-align: middle; }
.cell-text { cursor: pointer; display: block; padding: 4px 4px; border-radius: 4px; min-height: 24px; transition: background 0.1s; }
.cell-text:hover { background: var(--bg-hover); }
.cell-text.num { text-align: right; font-variant-numeric: tabular-nums; }
.cell-text.avg { color: var(--purple); font-weight: 600; }
.cell-text.desc { max-width: 200px; overflow: hidden; text-overflow: ellipsis; }
.cell-text.bold, .title-text.bold { font-weight: 700; color: #111827; }
.title-text { font-weight: 500; color: #111827; }
.add-task-btn, .add-sub-btn { opacity: 0; background: none; border: 1px dashed var(--border); padding: 1px 8px; border-radius: 4px; font-size: 0.65rem; color: var(--text-muted); cursor: pointer; margin-left: 6px; transition: all 0.15s; white-space: nowrap; }
tr:hover .add-task-btn, tr:hover .add-sub-btn { opacity: 1; }
.add-task-btn:hover, .add-sub-btn:hover { border-color: var(--purple); color: var(--purple); background: var(--purple-bg); }
.btn-delete { background: none; border: none; cursor: pointer; padding: 4px 6px; border-radius: 4px; opacity: 0; transition: all 0.15s; font-size: 0.85rem; }
tr:hover .btn-delete { opacity: 0.4; }
.btn-delete:hover { opacity: 1 !important; background: #fee2e2; }
.delete-inline { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.del-msg { font-size: 0.72rem; color: var(--text-secondary); }
.del-msg.warn { color: #ef4444; font-weight: 600; }
.btn-del-ok { background: #ef4444; color: #fff; border: none; padding: 3px 10px; border-radius: 4px; font-size: 0.75rem; cursor: pointer; font-weight: 600; }
.btn-del-ok:hover { background: #dc2626; }
.btn-del-cancel { background: none; border: 1px solid var(--border); color: var(--text-muted); padding: 3px 8px; border-radius: 4px; font-size: 0.75rem; cursor: pointer; }
.cell-input { width: 100%; padding: 4px 6px; border: 1.5px solid var(--purple); border-radius: 4px; font-size: 0.82rem; outline: none; background: var(--bg-card); }
.cell-input.num { text-align: right; width: 60px; }
.cell-input.title-input { width: 100%; }
.badge-num { display: inline-flex; align-items: center; justify-content: center; width: 26px; height: 26px; border-radius: 6px; font-size: 0.75rem; font-weight: 700; cursor: pointer; transition: all 0.15s; user-select: none; }
.badge-num:hover { transform: scale(1.1); }
.b-1 { background: var(--bg-hover); color: var(--text-muted); }
.b-2 { background: #dbeafe; color: #2563eb; }
.b-3 { background: #fef3c7; color: #d97706; }
.b-4 { background: #ffedd5; color: #ea580c; }
.b-5 { background: #fee2e2; color: #dc2626; }
.cell-select { padding: 3px 6px; border: 1px solid var(--border); border-radius: 6px; font-size: 0.72rem; font-weight: 600; cursor: pointer; outline: none; background: var(--bg-card); }
.st-todo { color: var(--text-muted); }
.st-in_progress { color: #2563eb; background: #eff6ff; }
.st-blocked { color: #dc2626; background: #fef2f2; }
.st-done { color: #059669; background: #f0fdf4; }
.col-check input[type="checkbox"] { width: 16px; height: 16px; accent-color: var(--purple); cursor: pointer; }
.sf { display: flex; flex-direction: column; gap: 16px; }
.fg { display: flex; flex-direction: column; gap: 4px; }
.fg label { font-size: 0.78rem; font-weight: 600; color: var(--text-secondary); }
.fi { padding: 9px 12px; border: 1px solid var(--border); border-radius: var(--radius-sm); font-size: 0.85rem; outline: none; background: var(--bg-card); width: 100%; }
.fi:focus { border-color: var(--purple); }
.fa { display: flex; gap: 10px; justify-content: flex-end; padding-top: 8px; border-top: 1px solid var(--border-light); }
.color-picks { display: flex; gap: 8px; }
.cpick { width: 28px; height: 28px; border-radius: 50%; border: 2px solid transparent; cursor: pointer; transition: all 0.15s; }
.cpick.active { border-color: var(--text); transform: scale(1.15); }
.pv-empty { text-align: center; padding: 60px 20px; background: var(--bg-card); border: 1px solid var(--border); border-radius: var(--radius-md); }
.empty-icon { font-size: 3rem; margin-bottom: 16px; }
.pv-empty h3 { font-size: 1.2rem; font-weight: 700; margin-bottom: 16px; }
@media (max-width: 768px) { .col-title { min-width: 140px; max-width: 180px; } .pv-table { font-size: 0.75rem; } }

.col-drag { left: 0; width: 24px; min-width: 24px; z-index: 5; }
.drag-handle { cursor: grab; font-size: 0.9rem; color: var(--text-muted); opacity: 0.3; user-select: none; display: flex; align-items: center; justify-content: center; }
.drag-handle:active { cursor: grabbing; }
tr:hover .drag-handle { opacity: 0.8; }
.row-drag-over { background: var(--purple-bg) !important; }
.row-drag-over .col-fix { background: var(--purple-bg) !important; }
</style>

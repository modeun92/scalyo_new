<template>
  <div class="pv">
    <!-- IMPORT -->
    <div v-if="showImport" class="import_section">
      <div class="import_project_select">
        <label>{{ t('smart_import_select_project') }}</label>
        <select v-model="importProjectId" class="mapping_select">
          <option v-for="p in taskStore.projects" :key="p.id" :value="p.id">{{ projectLabel({ t }, p) }}</option>
        </select>
        <p class="import_hint">{{ t('smart_import_select_project_hint') }}</p>
      </div>
      <StandardImport :fields="taskFields" :on-import="handleBulkImport" />
    </div>

    <div class="profile_view_header">
      <h1>📁 {{ t('smart_matrix_projects_title') }}</h1>
      <div class="profile_view_actions">
        <button class="button_outline" @click="showImport = !showImport">{{ t('import_btn_tasks') }}</button>
        <span class="scroll_hint">{{ t('smart_matrix_scroll_hint') }}</span>

        <!-- Reset global -->
        <div v-if="resetStep === 0">
          <button class="button_danger_outline" @click="resetStep = 1">{{ t('smart_matrix_reset_all') }}</button>
        </div>
        <div v-else-if="resetStep === 1" class="reset_confirm">
          <span class="reset_message">{{ t('smart_matrix_reset_step1') }}</span>
          <button class="button_danger_outline" @click="resetStep = 2">{{ t('smart_matrix_reset_confirm') }}</button>
          <button class="button_outline" @click="resetStep = 0">{{ t('smart_matrix_reset_cancel') }}</button>
        </div>
        <div v-else-if="resetStep === 2" class="reset_confirm">
          <span class="reset_message warn">{{ t('smart_matrix_reset_step2') }}</span>
          <button class="button_danger" @click="doResetAll">{{ t('smart_matrix_reset_confirm') }}</button>
          <button class="button_outline" @click="resetStep = 0">{{ t('smart_matrix_reset_cancel') }}</button>
        </div>

        <button class="button_primary" @click="slideOpen = true">{{ t('smart_matrix_new_project') }}</button>
      </div>
    </div>

    <!-- TABLE -->
    <div v-if="rows.length" class="table_outer">
      <div class="table_scroll" ref="scrollRef">
        <table class="profile_view_table">
          <thead>
            <tr>
              <th class="column_fix column_expand"></th>
                <th class="column_fix column_drag"></th>
              <th class="column_fix column_number">#</th>
              <th class="column_fix column_title">{{ t('smart_matrix_col_title') }}</th>
              <th class="column_scroll column_date">{{ t('smart_matrix_col_start') }}</th>
              <th class="column_scroll column_date">{{ t('smart_matrix_col_end') }}</th>
              <th class="column_scroll column_badge">{{ t('smart_matrix_col_urgency') }}</th>
              <th class="column_scroll column_badge">{{ t('smart_matrix_col_difficulty') }}</th>
              <th class="column_scroll column_status">{{ t('status_todo').split(' ')[0] }}</th>
              <th class="column_scroll column_number_input">{{ t('smart_matrix_col_expected') }}</th>
              <th class="column_scroll column_number_input">{{ t('smart_matrix_col_min') }}</th>
              <th class="column_scroll column_number_input">{{ t('smart_matrix_col_max') }}</th>
              <th class="column_scroll column_number_input column_average">{{ t('smart_matrix_col_avg') }}</th>
              <th class="column_scroll column_description">{{ t('smart_matrix_col_desc') }}</th>
              <th class="column_scroll column_actions"></th>
            </tr>
          </thead>
          <tbody>
            <template v-for="(row, ri) in visibleRows" :key="row.id">
              <tr :class="['row_level' + (row.level || 0), { 'row_project': row.type === 'project', 'row_done': row.status === 'done', 'row_drag_over': dragOverRowId === row.id }]"
                @dragover.prevent="onRowDragOver($event, row)"
                @drop="onRowDrop($event, row)">
                <td class="column_fix column_expand">
                  <button v-if="row.hasChildren" class="exp_button" @click="toggleExpand(row.id)">{{ expanded[row.id] ? '▾' : '▸' }}</button>
                </td>
                <td class="column_fix column_drag">
                  <span class="drag_handle" draggable="true" @dragstart="onRowDragStart($event, row, ri)" @dragend="onRowDragEnd">⠿</span>
                </td>
                <td class="column_fix column_number">{{ ri + 1 }}</td>
                <td class="column_fix column_title" :style="{ paddingLeft: (12 + (row.level || 0) * 24) + 'px' }">
                  <span v-if="editCell === row.id + '_title'" class="edit_wrapper">
                    <input v-model="row.title" class="cell_input title_input" @keydown.enter="saveCell(row)" @keydown.tab.prevent="saveCell(row)" @keydown.escape="editCell = null" />
                  </span>
                  <span v-else class="cell_text title_text" :class="{ bold: row.type === 'project' }" @click="editCell = row.id + '_title'">{{ (row.type === 'project' ? projectLabel({ t }, row) : row.title) || '—' }}</span>
                  <button v-if="row.type === 'project'" class="add_task_button" @click.stop="addTaskToProject(row.id)">+ {{ t('smart_matrix_new_task') }}</button>
                  <button v-else-if="row.type === 'task'" class="add_sub_button" @click.stop="addSubtaskToRow(row)">+</button>
                </td>
                <td class="column_scroll column_date" @click="editCell = row.id + '_startDate'">
                  <input v-if="editCell === row.id + '_startDate'" v-model="row.startDate" type="date" class="cell_input" @keydown.enter="saveCell(row)" @blur="saveCell(row)" />
                  <span v-else class="cell_text">{{ row.startDate ? fmtDate(row.startDate) : '—' }}</span>
                </td>
                <td class="column_scroll column_date" @click="editCell = row.id + '_endDate'">
                  <input v-if="editCell === row.id + '_endDate'" v-model="row.endDate" type="date" class="cell_input" @keydown.enter="saveCell(row)" @blur="saveCell(row)" />
                  <span v-else class="cell_text">{{ row.endDate ? fmtDate(row.endDate) : '—' }}</span>
                </td>
                <td class="column_scroll column_badge" @click="row.type !== 'project' && cycleBadge(row, 'urgency')">
                  <span v-if="row.type !== 'project'" class="badge_number" :class="'bar_' + (row.urgency ?? 0)" :title="levelTitle('urgency', row.urgency)">{{ row.urgency ?? '—' }}</span>
                </td>
                <td class="column_scroll column_badge" @click="row.type !== 'project' && cycleBadge(row, 'difficulty')">
                  <span v-if="row.type !== 'project'" class="badge_number" :class="'bar_' + (row.difficulty ?? 0)" :title="levelTitle('difficulty', row.difficulty)">{{ row.difficulty ?? '—' }}</span>
                </td>
                <td class="column_scroll column_status">
                  <select v-if="row.type !== 'project'" v-model="row.status" class="cell_select" :class="'status_' + row.status" @change="saveCell(row)">
                    <option v-if="!row.status" :value="null">—</option>
                    <option v-for="s in taskStore.statuses" :key="s.id" :value="s.key">{{ statusLabel(i18n, s.key) }}</option>
                  </select>
                </td>
                <td class="column_scroll column_number_input" @click="editCell = row.id + '_expectedHours'">
                  <input v-if="editCell === row.id + '_expectedHours'" v-model.number="row.expectedHours" type="number" min="0" step="0.5" class="cell_input num" @keydown.enter="saveCell(row)" @blur="saveCell(row)" />
                  <span v-else class="cell_text num">{{ row.expectedHours || '—' }}</span>
                </td>
                <td class="column_scroll column_number_input" @click="editCell = row.id + '_minHours'">
                  <input v-if="editCell === row.id + '_minHours'" v-model.number="row.minHours" type="number" min="0" step="0.5" class="cell_input num" @keydown.enter="saveCell(row)" @blur="saveCell(row)" />
                  <span v-else class="cell_text num">{{ row.minHours || '—' }}</span>
                </td>
                <td class="column_scroll column_number_input" @click="editCell = row.id + '_maxHours'">
                  <input v-if="editCell === row.id + '_maxHours'" v-model.number="row.maxHours" type="number" min="0" step="0.5" class="cell_input num" @keydown.enter="saveCell(row)" @blur="saveCell(row)" />
                  <span v-else class="cell_text num">{{ row.maxHours || '—' }}</span>
                </td>
                <td class="column_scroll column_number_input column_average">
                  <span class="cell_text num avg">{{ avgHours(row) }}</span>
                </td>
                <td class="column_scroll column_description" @click="editCell = row.id + '_description'">
                  <input v-if="editCell === row.id + '_description'" v-model="row.description" class="cell_input" @keydown.enter="saveCell(row)" @blur="saveCell(row)" />
                  <span v-else class="cell_text desc">{{ row.description || '—' }}</span>
                </td>
                <td class="column_scroll column_actions">
                  <!-- Double validation delete inline -->
                  <template v-if="deleteConfirmId === row.id">
                    <div class="delete_inline">
                      <span class="del_message">{{ row.type === 'project' ? t('smart_matrix_delete_project_inline') : t('smart_matrix_delete_task_confirm') }}</span>
                      <button class="button_delete_ok" @click="confirmDelete(row)">✓</button>
                      <button class="button_delete_cancel" @click="deleteConfirmId = null">✕</button>
                    </div>
                  </template>
                  <template v-else-if="deleteConfirm2Id === row.id">
                    <div class="delete_inline warn">
                      <span class="del_message warn">{{ t('smart_matrix_delete_project_confirm2') }}</span>
                      <button class="button_delete_ok" @click="finalDelete(row)">✓</button>
                      <button class="button_delete_cancel" @click="deleteConfirm2Id = null">✕</button>
                    </div>
                  </template>
                  <template v-else>
                    <button class="button_delete" @click="deleteConfirmId = row.id" :title="t('delete')">🗑</button>
                  </template>
                </td>
              </tr>
            </template>
            <!-- Totals row -->
            <tr class="row_totals">
              <td class="column_fix column_expand"></td>
              <td class="column_fix column_number"></td>
              <td class="column_fix column_title"><strong>{{ t('smart_matrix_totals') }}</strong></td>
              <td class="column_scroll column_date"></td>
              <td class="column_scroll column_date"></td>
              <td class="column_scroll column_badge"></td>
              <td class="column_scroll column_badge"></td>
              <td class="column_scroll column_status">{{ totals.finished }}/{{ totals.total }}</td>
              <td class="column_scroll column_number_input"><strong>{{ totals.expected }}</strong></td>
              <td class="column_scroll column_number_input"><strong>{{ totals.min }}</strong></td>
              <td class="column_scroll column_number_input"><strong>{{ totals.max }}</strong></td>
              <td class="column_scroll column_number_input column_average"><strong>{{ totals.avg }}</strong></td>
              <td class="column_scroll column_description"></td>
              <td class="column_scroll column_actions"></td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- Empty -->
    <div v-else class="profile_view_empty">
      <div class="empty_icon">📁</div>
      <h3>{{ t('smart_matrix_no_projects') }}</h3>
      <button class="button_primary" @click="slideOpen = true">{{ t('smart_matrix_new_project') }}</button>
    </div>

    <!-- Slide-over new project -->
    <SlideOver :open="slideOpen" :title="t('smart_matrix_new_project')" @close="slideOpen = false">
      <form @submit.prevent="createProject" class="slideover_form">
        <div class="field_group"><label>{{ t('smart_matrix_project_name') }} *</label><input v-model="newName" required class="field_input" /></div>
        <div class="form_actions">
          <button type="button" class="button_outline" @click="slideOpen = false">{{ t('cancel') }}</button>
          <button type="submit" class="button_primary" :disabled="creating">{{ t('create') }}</button>
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
import { fmtDate } from '@/lib/formatters' // DATE-RAW: read-mode cells are formatted, the date input stays ISO
import { statusLabel, urgencyLabel, difficultyLabel, projectLabel } from '@/lib/taskLabels'

const i18n = useI18n({ useScope: 'global' })
const { t } = i18n
const taskStore = useTaskStore()

const slideOpen = ref(false)
const newName = ref('')
const creating = ref(false)
const editCell = ref(null)
const expanded = reactive({})
const resetStep = ref(0)
const deleteConfirmId = ref(null)
const deleteConfirm2Id = ref(null)
const showImport = ref(false)
const importProjectId = ref('')

// CORE-V2-TASK: every imported task goes into a project (a task always has one); with no project
// to put them in, nothing is imported.
var handleBulkImport = async function (rows) {
  var pid = importProjectId.value || (taskStore.projects[0]?.id || '')
  if (!pid) return 0
  var count = 0
  for (var i = 0; i < rows.length; i++) {
    try {
      var result = await taskStore.addTask({ ...rows[i], projectId: pid })
      if (result?.success) count++
    } catch (e) { /* counted as not imported */ }
  }
  if (count > 0) showImport.value = false
  return count
}

// Build flat rows from store — projects + their tasks
const rows = computed(() => {
  const result = []
  for (const project of taskStore.projects) {
    const p = { ...project, type: 'project', level: 0 }
    // top-level tasks here; their sub-tasks under them (a sub-task carries the project too)
    const projectTasks = taskStore.tasks.filter(t => t.projectId === project.id && !t.parentId)
    p.hasChildren = projectTasks.length > 0
    result.push(p)
    if (expanded[project.id] !== false) {
      for (const task of projectTasks) {
        const taskRow = { ...task, type: 'task', level: 1 }
        const subs = taskStore.tasks.filter(t => t.parentId === task.id)
        taskRow.hasChildren = subs.length > 0
        result.push(taskRow)
        if (expanded[task.id]) {
          for (const sub of subs) {
            result.push({ ...sub, type: 'subtask', level: 2, hasChildren: false })
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
    taskStore.updateProject(row.id, { title: row.title })
  } else {
    taskStore.updateTask(row.id, {
      title: row.title,
      status: row.status,
      startDate: row.startDate,
      endDate: row.endDate,
      urgency: row.urgency,
      difficulty: row.difficulty,
      expectedHours: row.expectedHours,
      minHours: row.minHours,
      maxHours: row.maxHours,
      description: row.description,
    })
  }
}

// 1..5 then back to 1; a task with none starts at 1 (the old code started from an invented 3).
function cycleBadge(row, field) {
  row[field] = ((row[field] || 0) % 5) + 1
  saveCell(row)
}
function levelTitle(field, level) {
  const list = field === 'urgency' ? taskStore.urgencies : taskStore.difficulties
  const key = list.find(x => x.level === level)?.key
  return key ? (field === 'urgency' ? urgencyLabel(i18n, key) : difficultyLabel(i18n, key)) : ''
}

function avgHours(row) {
  if (row.minHours && row.maxHours) return ((row.minHours + row.maxHours) / 2).toFixed(1)
  return '—'
}

const totals = computed(() => {
  const allTasks = rows.value.filter(r => r.type !== 'project')
  return {
    total: allTasks.length,
    finished: allTasks.filter(r => r.status === 'done').length,
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

// The new row's title cell opens for typing — on the id the database gave it (the old code opened a
// made-up 't_<time>' id no row ever had, so nothing opened).
async function addTaskToProject(projectId) {
  const res = await taskStore.addTask({ title: '', projectId })
  if (!res?.success) return
  expanded[projectId] = true
  editCell.value = res.data.id + '_title'
}

async function addSubtaskToRow(parentRow) {
  const res = await taskStore.addTask({ title: '', projectId: parentRow.projectId, parentId: parentRow.id })
  if (!res?.success) return
  expanded[parentRow.id] = true
  editCell.value = res.data.id + '_title'
}

function confirmDelete(row) {
  deleteConfirmId.value = null
  deleteConfirm2Id.value = row.id
}

async function finalDelete(row) {
  deleteConfirm2Id.value = null
  if (row.type === 'project') await taskStore.deleteProject(row.id)
  else await taskStore.deleteTask(row.id)
}

async function doResetAll() {
  await taskStore.resetAll()
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

// D-14: the panel closes on a created project only. A project has no colour any more (not in the model).
async function createProject() {
  if (creating.value) return
  creating.value = true
  try {
    const res = await taskStore.addProject({ name: newName.value })
    if (!res?.success) return
    newName.value = ''
    slideOpen.value = false
  } finally {
    creating.value = false
  }
}
</script>

<style scoped>
.pv { max-width: 100%; }
.profile_view_header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; flex-wrap: wrap; gap: 12px; }
.profile_view_header h1 { font-size: 1.5rem; font-weight: 800; }
.profile_view_actions { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.scroll_hint { font-size: 0.72rem; color: var(--text-muted); }
.button_primary { background: var(--purple); color: #fff; border: none; padding: 9px 18px; border-radius: var(--radius-sm); font-size: 0.85rem; font-weight: 600; cursor: pointer; }
.button_primary:hover { background: var(--purple-dark); }
.button_outline { background: var(--bg-card); color: var(--text-secondary); border: 1px solid var(--border); padding: 9px 18px; border-radius: var(--radius-sm); font-size: 0.85rem; cursor: pointer; }
.button_danger { background: #ef4444; color: #fff; border: none; padding: 9px 18px; border-radius: var(--radius-sm); font-size: 0.85rem; font-weight: 600; cursor: pointer; }
.button_danger:hover { background: #dc2626; }
.button_danger_outline { background: none; color: #ef4444; border: 1px solid #ef4444; padding: 9px 18px; border-radius: var(--radius-sm); font-size: 0.85rem; font-weight: 600; cursor: pointer; }
.button_danger_outline:hover { background: #fef2f2; }
.reset_confirm { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.reset_message { font-size: 0.78rem; color: var(--text-secondary); }
.reset_message.warn { color: #ef4444; font-weight: 600; }

.table_outer { background: var(--bg-card); border: 1px solid var(--border); border-radius: var(--radius-md); overflow: hidden; }
.table_scroll { overflow: auto; max-height: calc(100vh - 200px); }
.profile_view_table { width: max-content; min-width: 100%; border-collapse: separate; border-spacing: 0; font-size: 0.82rem; }
.profile_view_table thead th { padding: 10px 8px; font-size: 0.68rem; font-weight: 700; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.03em; border-bottom: 2px solid var(--border); white-space: nowrap; text-align: left; background: #f9fafb; position: sticky; top: 0; z-index: 20; }
.column_fix { position: sticky; z-index: 5; background: var(--bg-card); }
.column_expand { left: 24px; width: 32px; min-width: 32px; }
.column_number { left: 56px; width: 36px; min-width: 36px; text-align: center; color: var(--text-muted); }
.column_title { left: 92px; min-width: 220px; max-width: 300px; border-right: 2px solid var(--border); }
.profile_view_table thead th.column_fix { z-index: 30; background: #f9fafb; }
.profile_view_table thead th.column_title { border-right: 2px solid var(--border); }
.column_scroll { white-space: nowrap; position: relative; z-index: 1; }
.column_date { width: 110px; min-width: 110px; }
.column_badge { width: 70px; min-width: 70px; text-align: center; }
.column_status { width: 100px; min-width: 100px; }
.column_number_input { width: 80px; min-width: 80px; text-align: right; }
.column_average { background: rgba(124,58,237,0.03); }
.column_description { width: 200px; min-width: 200px; }
.column_actions { width: 180px; min-width: 180px; position: relative; z-index: 2; }
.profile_view_table tbody tr { transition: background 0.1s; }
.profile_view_table tbody td { border-bottom: 1px solid var(--border-light); padding: 6px 8px; vertical-align: middle; }
.profile_view_table tbody tr:hover { background: rgba(0,0,0,0.015); }
.row_project { background: #f5f3ff; }
.row_project .column_fix { background: #f5f3ff; }
.row_project:hover .column_fix { background: #ede9fe; }
.row_level_2 { background: #fafafa; }
.row_level_2 .column_fix { background: #fafafa; }
.row_done { opacity: 0.55; }
tr:hover .column_fix { background: var(--bg-hover); }
.row_totals { background: var(--bg); font-weight: 600; border-top: 2px solid var(--border); }
.row_totals .column_fix { background: var(--bg-hover); }
.row_totals td { padding: 10px 8px; font-size: 0.78rem; }
.exp_button { background: none; border: none; cursor: pointer; font-size: 0.75rem; color: var(--text-muted); padding: 2px 4px; border-radius: 4px; width: 100%; }
.exp_button:hover { background: var(--bg-hover); color: var(--text); }
.cell_text { cursor: pointer; display: block; padding: 4px 4px; border-radius: 4px; min-height: 24px; transition: background 0.1s; }
.cell_text:hover { background: var(--bg-hover); }
.cell_text.num { text-align: right; font-variant-numeric: tabular-nums; }
.cell_text.avg { color: var(--purple); font-weight: 600; }
.cell_text.desc { max-width: 200px; overflow: hidden; text-overflow: ellipsis; }
.cell_text.bold, .title_text.bold { font-weight: 700; color: #111827; }
.title_text { font-weight: 500; color: #111827; }
.add_task_button, .add_sub_button { opacity: 0; background: none; border: 1px dashed var(--border); padding: 1px 8px; border-radius: 4px; font-size: 0.65rem; color: var(--text-muted); cursor: pointer; margin-left: 6px; transition: all 0.15s; white-space: nowrap; }
tr:hover .add_task_button, tr:hover .add_sub_button { opacity: 1; }
.add_task_button:hover, .add_sub_button:hover { border-color: var(--purple); color: var(--purple); background: var(--purple-bg); }
.button_delete { background: none; border: none; cursor: pointer; padding: 4px 6px; border-radius: 4px; opacity: 0; transition: all 0.15s; font-size: 0.85rem; }
tr:hover .button_delete { opacity: 0.4; }
.button_delete:hover { opacity: 1 !important; background: #fee2e2; }
.delete_inline { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.del_message { font-size: 0.72rem; color: var(--text-secondary); }
.del_message.warn { color: #ef4444; font-weight: 600; }
.button_delete_ok { background: #ef4444; color: #fff; border: none; padding: 3px 10px; border-radius: 4px; font-size: 0.75rem; cursor: pointer; font-weight: 600; }
.button_delete_ok:hover { background: #dc2626; }
.button_delete_cancel { background: none; border: 1px solid var(--border); color: var(--text-muted); padding: 3px 8px; border-radius: 4px; font-size: 0.75rem; cursor: pointer; }
.cell_input { width: 100%; padding: 4px 6px; border: 1.5px solid var(--purple); border-radius: 4px; font-size: 0.82rem; outline: none; background: var(--bg-card); }
.cell_input.num { text-align: right; width: 60px; }
.cell_input.title_input { width: 100%; }
.badge_number { display: inline-flex; align-items: center; justify-content: center; width: 26px; height: 26px; border-radius: 6px; font-size: 0.75rem; font-weight: 700; cursor: pointer; transition: all 0.15s; user-select: none; }
.badge_number:hover { transform: scale(1.1); }
.bar_1 { background: var(--bg-hover); color: var(--text-muted); }
.bar_2 { background: #dbeafe; color: #2563eb; }
.bar_3 { background: #fef3c7; color: #d97706; }
.bar_4 { background: #ffedd5; color: #ea580c; }
.bar_5 { background: #fee2e2; color: #dc2626; }
.cell_select { padding: 3px 6px; border: 1px solid var(--border); border-radius: 6px; font-size: 0.72rem; font-weight: 600; cursor: pointer; outline: none; background: var(--bg-card); }
.status_todo { color: var(--text-muted); }
.status_in_progress { color: #2563eb; background: #eff6ff; }
.status_blocked { color: #dc2626; background: #fef2f2; }
.status_done { color: #059669; background: #f0fdf4; }
.slideover_form { display: flex; flex-direction: column; gap: 16px; }
.field_group { display: flex; flex-direction: column; gap: 4px; }
.field_group label { font-size: 0.78rem; font-weight: 600; color: var(--text-secondary); }
.field_input { padding: 9px 12px; border: 1px solid var(--border); border-radius: var(--radius-sm); font-size: 0.85rem; outline: none; background: var(--bg-card); width: 100%; }
.field_input:focus { border-color: var(--purple); }
.form_actions { display: flex; gap: 10px; justify-content: flex-end; padding-top: 8px; border-top: 1px solid var(--border-light); }
.profile_view_empty { text-align: center; padding: 60px 20px; background: var(--bg-card); border: 1px solid var(--border); border-radius: var(--radius-md); }
.empty_icon { font-size: 3rem; margin-bottom: 16px; }
.profile_view_empty h3 { font-size: 1.2rem; font-weight: 700; margin-bottom: 16px; }
@media (max-width: 768px) { .column_title { min-width: 140px; max-width: 180px; } .profile_view_table { font-size: 0.75rem; } }

.column_drag { left: 0; width: 24px; min-width: 24px; z-index: 5; }
.drag_handle { cursor: grab; font-size: 0.9rem; color: var(--text-muted); opacity: 0.3; user-select: none; display: flex; align-items: center; justify-content: center; }
.drag_handle:active { cursor: grabbing; }
tr:hover .drag_handle { opacity: 0.8; }
.row_drag_over { background: var(--purple-bg) !important; }
.row_drag_over .column_fix { background: var(--purple-bg) !important; }
</style>

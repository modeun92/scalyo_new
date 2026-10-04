<template>
  <div class="priorities_view">
    <h1>🎯 {{ t('smart_matrix_priorities_title') }}</h1>

    <AiInsightPanel
      module="matrix"
      :title="t('ai_matrix_title')"
      :button-label="t('ai_matrix_btn')"
      :message="t('ai_matrix_prompt')"
      :context="{ tasks: tasks.tasks?.map(x => ({ title: x.title, urgency: x.urgency, status: x.status, dueDate: x.dueDate })) || [] }"
    />

    <!-- Unclassified: no urgency yet -->
    <div class="priority_unclassified">
      <h3>{{ t('smart_matrix_not_classified') }} <span class="priority_count">{{ unclassified.length }}</span></h3>
      <div class="priority_cards_row" @dragover.prevent @drop="onDrop($event, null)">
        <div v-for="task in unclassified" :key="task.id" class="priority_chip" draggable="true" @dragstart="onDragStart($event, task)">
          {{ task.title }}
        </div>
        <span v-if="!unclassified.length" class="priority_empty_hint">{{ t('smart_matrix_no_tasks') }}</span>
      </div>
    </div>

    <!-- One column per urgency level of the organization, most urgent first -->
    <div class="matrix">
      <div v-for="u in levels" :key="u.id" class="matrix_quad" :class="'tone_' + urgencyTone(u.level)" @dragover.prevent @drop="onDrop($event, u.level)">
        <div class="matrix_quadrant_header">
          <strong>{{ urgencyLabel(i18n, u.key) }}</strong>
          <span class="matrix_quadrant_description">{{ levelTasks(u.level).length }}</span>
        </div>
        <div class="matrix_quadrant_tasks">
          <div v-for="task in levelTasks(u.level)" :key="task.id" class="matrix_quadrant_card" draggable="true" @dragstart="onDragStart($event, task)">
            <span class="matrix_quadrant_status" :class="task.status" />
            <div class="matrix_quadrant_info">
              <strong>{{ task.title }}</strong>
              <span v-if="task.clientId" class="matrix_quadrant_client">{{ clientName(task.clientId) }}</span>
            </div>
            <span class="matrix_quadrant_due" :class="{ late: isOverdue(task) }">{{ task.dueDate ? fmtDate(task.dueDate) : '' }}</span>
          </div>
          <div v-if="!levelTasks(u.level).length" class="matrix_quadrant_empty">{{ t('smart_matrix_no_tasks') }}</div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useTaskStore } from '@/stores/tasks'
import { useClientStore } from '@/stores/clients'
import AiInsightPanel from '@/components/ai/AiInsightPanel.vue'
import { fmtDate, localDateKey } from '@/lib/formatters' // DATE-RAW
import { urgencyLabel, urgencyTone } from '@/lib/taskLabels'

const i18n = useI18n({ useScope: 'global' })
const { t } = i18n
const tasks = useTaskStore()
const clients = useClientStore()

let draggedTask = null

// CORE-V2-TASK (decided 04/10/2026): the priority quadrants (urgent_important / important / urgent /
// not_urgent) are not in the task model any more; the matrix sorts by the organization's urgency levels
// (task_urgency), and dropping a task on a column sets its urgency.
const levels = computed(() => [...tasks.urgencies].sort((a, b) => b.level - a.level))
const unclassified = computed(() => tasks.tasks.filter(x => x.urgency == null && x.status !== 'done' && !x.parentId))
function levelTasks(level) { return tasks.tasks.filter(x => x.urgency === level && x.status !== 'done' && !x.parentId) }
function clientName(id) { return clients.clients.find(c => c.id === id)?.name || '' }
function isOverdue(task) { return task.status !== 'done' && !!task.dueDate && task.dueDate < localDateKey() }

function onDragStart(e, task) { draggedTask = task; e.dataTransfer.effectAllowed = 'move' }
function onDrop(e, level) {
  if (draggedTask) {
    tasks.updateTask(draggedTask.id, { urgency: level })
    draggedTask = null
  }
}
</script>

<style scoped>
.priorities_view { max-width: 1000px; }
.priorities_view h1 { font-size: 1.5rem; font-weight: 800; margin-bottom: 20px; }

.priority_unclassified { background: var(--bg-card); border: 1px solid var(--border); border-radius: var(--radius-md); padding: 16px; margin-bottom: 20px; }
.priority_unclassified h3 { font-size: 0.9rem; font-weight: 700; margin-bottom: 10px; }
.priority_count { font-size: 0.72rem; color: var(--text-muted); background: var(--bg); padding: 2px 8px; border-radius: 4px; margin-left: 6px; }
.priority_cards_row { display: flex; gap: 8px; flex-wrap: wrap; min-height: 40px; padding: 4px; border: 2px dashed transparent; border-radius: var(--radius-sm); transition: all 0.2s; }
.priority_cards_row:hover { border-color: var(--border); }
.priority_chip { background: var(--bg); border: 1px solid var(--border); border-radius: 6px; padding: 6px 12px; font-size: 0.8rem; cursor: grab; transition: all 0.15s; }
.priority_chip:hover { box-shadow: var(--shadow-sm); }
.priority_chip:active { cursor: grabbing; }
.priority_empty_hint { font-size: 0.78rem; color: var(--text-muted); padding: 8px; }

.matrix { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 14px; }
.matrix_quad { background: var(--bg-card); border: 1px solid var(--border); border-radius: var(--radius-md); padding: 16px; min-height: 200px; transition: all 0.2s; }
.matrix_quad:hover { border-color: var(--border); }
.matrix_quad.tone_critical { border-top: 3px solid var(--red); }
.matrix_quad.tone_high { border-top: 3px solid var(--amber); }
.matrix_quad.tone_medium { border-top: 3px solid var(--blue); }
.matrix_quad.tone_low { border-top: 3px solid var(--text-muted); }

.matrix_quadrant_header { margin-bottom: 12px; }
.matrix_quadrant_header strong { font-size: 0.9rem; display: block; }
.matrix_quadrant_description { font-size: 0.72rem; color: var(--text-muted); }

.matrix_quadrant_tasks { display: flex; flex-direction: column; gap: 6px; }
.matrix_quadrant_card { display: flex; align-items: center; gap: 8px; padding: 10px; border: 1px solid var(--border-light); border-radius: var(--radius-sm); cursor: grab; transition: all 0.15s; }
.matrix_quadrant_card:hover { background: var(--bg-hover); box-shadow: var(--shadow-sm); }
.matrix_quadrant_card:active { cursor: grabbing; }
.matrix_quadrant_status { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
.matrix_quadrant_status.todo { background: var(--text-muted); }
.matrix_quadrant_status.in_progress { background: var(--blue); }
.matrix_quadrant_status.blocked { background: var(--red); }
.matrix_quadrant_info { flex: 1; min-width: 0; }
.matrix_quadrant_info strong { font-size: 0.82rem; display: block; }
.matrix_quadrant_client { font-size: 0.68rem; color: var(--purple); background: var(--purple-bg); padding: 1px 6px; border-radius: 4px; }
.matrix_quadrant_due { font-size: 0.7rem; color: var(--text-muted); flex-shrink: 0; }
.matrix_quadrant_due.late { color: var(--red); font-weight: 600; }
.matrix_quadrant_empty { text-align: center; padding: 20px; color: var(--text-muted); font-size: 0.82rem; }

@media (max-width: 768px) { .matrix { grid-template-columns: 1fr; } }
</style>

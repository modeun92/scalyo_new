<template>
  <div class="priorities_view">
    <h1>🎯 {{ t('sm_priorities_title') }}</h1>

    <AiInsightPanel
      module="matrix"
      :title="t('ai_matrix_title')"
      :button-label="t('ai_matrix_btn')"
      :message="t('ai_matrix_prompt')"
      :context="{ tasks: tasks.tasks?.map(t => ({ title: t.title, priority: t.priority, status: t.status, dueDate: t.dueDate })) || [] }"
    />

    <!-- Unclassified -->
    <div class="priority_unclassified">
      <h3>{{ t('sm_not_classified') }} <span class="priority_count">{{ unclassified.length }}</span></h3>
      <div class="priority_cards_row" @dragover.prevent @drop="onDrop($event, null)">
        <div v-for="task in unclassified" :key="task.id" class="priority_chip" draggable="true" @dragstart="onDragStart($event, task)">
          {{ task.title }}
        </div>
        <span v-if="!unclassified.length" class="priority_empty_hint">{{ t('sm_no_tasks') }}</span>
      </div>
    </div>

    <!-- Eisenhower Matrix -->
    <div class="matrix">
      <div v-for="q in quadrants" :key="q.key" class="matrix_quad" :class="q.key" @dragover.prevent @drop="onDrop($event, q.key)">
        <div class="matrix_quadrant_header">
          <strong>{{ t(q.labelKey) }}</strong>
          <span class="matrix_quadrant_description">{{ t(q.descKey) }}</span>
        </div>
        <div class="matrix_quadrant_tasks">
          <div v-for="task in quadrantTasks(q.key)" :key="task.id" class="matrix_quadrant_card" draggable="true" @dragstart="onDragStart($event, task)">
            <span class="matrix_quadrant_status" :class="task.status" />
            <div class="matrix_quadrant_info">
              <strong>{{ task.title }}</strong>
              <span v-if="task.clientId" class="matrix_quadrant_client">{{ clientName(task.clientId) }}</span>
            </div>
            <span class="matrix_quadrant_due" :class="{ late: isOverdue(task) }">{{ task.dueDate ? fmtDate(task.dueDate) : '' }}</span>
          </div>
          <div v-if="!quadrantTasks(q.key).length" class="matrix_quadrant_empty">{{ t('sm_no_tasks') }}</div>
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
import { fmtDate } from '@/lib/formatters' // DATE-RAW

const { t } = useI18n({ useScope: 'global' })
const tasks = useTaskStore()
const clients = useClientStore()

let draggedTask = null

const quadrants = [
  { key: 'urgent_important', labelKey: 'sm_do_now', descKey: 'sm_do_now_desc' },
  { key: 'important', labelKey: 'sm_schedule', descKey: 'sm_schedule_desc' },
  { key: 'urgent', labelKey: 'sm_delegate', descKey: 'sm_delegate_desc' },
  { key: 'not_urgent', labelKey: 'sm_eliminate', descKey: 'sm_eliminate_desc' },
]

const unclassified = computed(() => tasks.tasks.filter(t => !t.priority || !quadrants.some(q => q.key === t.priority)))
function quadrantTasks(key) { return tasks.tasks.filter(t => t.priority === key && t.status !== 'done') }
function clientName(id) { return clients.clients.find(c => c.id === id)?.name || '' }
function isOverdue(task) { return task.status !== 'done' && task.dueDate < new Date().toISOString().slice(0, 10) }

function onDragStart(e, task) { draggedTask = task; e.dataTransfer.effectAllowed = 'move' }
function onDrop(e, priority) {
  if (draggedTask) {
    tasks.updateTask(draggedTask.id, { priority })
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

.matrix { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
.matrix_quad { background: var(--bg-card); border: 1px solid var(--border); border-radius: var(--radius-md); padding: 16px; min-height: 200px; transition: all 0.2s; }
.matrix_quad:hover { border-color: var(--border); }
.matrix_quad.urgent_important { border-top: 3px solid var(--red); }
.matrix_quad.important { border-top: 3px solid var(--blue); }
.matrix_quad.urgent { border-top: 3px solid var(--amber); }
.matrix_quad.not_urgent { border-top: 3px solid var(--text-muted); }

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

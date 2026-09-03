<template>
  <div class="priorities-view">
    <h1>🎯 {{ t('sm_priorities_title') }}</h1>

    <AiInsightPanel
      module="matrice"
      :title="t('ai_matrice_title')"
      :button-label="t('ai_matrice_btn')"
      :message="t('ai_matrice_prompt')"
      :context="{ tasks: tasks.tasks?.map(t => ({ title: t.title, priority: t.priority, status: t.status, dueDate: t.dueDate })) || [] }"
    />

    <!-- Unclassified -->
    <div class="prio-unclassified">
      <h3>{{ t('sm_not_classified') }} <span class="prio-count">{{ unclassified.length }}</span></h3>
      <div class="prio-cards-row" @dragover.prevent @drop="onDrop($event, null)">
        <div v-for="task in unclassified" :key="task.id" class="prio-chip" draggable="true" @dragstart="onDragStart($event, task)">
          {{ task.title }}
        </div>
        <span v-if="!unclassified.length" class="prio-empty-hint">{{ t('sm_no_tasks') }}</span>
      </div>
    </div>

    <!-- Eisenhower Matrix -->
    <div class="matrix">
      <div v-for="q in quadrants" :key="q.key" class="matrix-quad" :class="q.key" @dragover.prevent @drop="onDrop($event, q.key)">
        <div class="mq-header">
          <strong>{{ t(q.labelKey) }}</strong>
          <span class="mq-desc">{{ t(q.descKey) }}</span>
        </div>
        <div class="mq-tasks">
          <div v-for="task in quadrantTasks(q.key)" :key="task.id" class="mq-card" draggable="true" @dragstart="onDragStart($event, task)">
            <span class="mq-status" :class="task.status" />
            <div class="mq-info">
              <strong>{{ task.title }}</strong>
              <span v-if="task.clientId" class="mq-client">{{ clientName(task.clientId) }}</span>
            </div>
            <span class="mq-due" :class="{ late: isOverdue(task) }">{{ task.dueDate ? fmtDate(task.dueDate) : '' }}</span>
          </div>
          <div v-if="!quadrantTasks(q.key).length" class="mq-empty">{{ t('sm_no_tasks') }}</div>
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
.priorities-view { max-width: 1000px; }
.priorities-view h1 { font-size: 1.5rem; font-weight: 800; margin-bottom: 20px; }

.prio-unclassified { background: var(--bg-card); border: 1px solid var(--border); border-radius: var(--radius-md); padding: 16px; margin-bottom: 20px; }
.prio-unclassified h3 { font-size: 0.9rem; font-weight: 700; margin-bottom: 10px; }
.prio-count { font-size: 0.72rem; color: var(--text-muted); background: var(--bg); padding: 2px 8px; border-radius: 4px; margin-left: 6px; }
.prio-cards-row { display: flex; gap: 8px; flex-wrap: wrap; min-height: 40px; padding: 4px; border: 2px dashed transparent; border-radius: var(--radius-sm); transition: all 0.2s; }
.prio-cards-row:hover { border-color: var(--border); }
.prio-chip { background: var(--bg); border: 1px solid var(--border); border-radius: 6px; padding: 6px 12px; font-size: 0.8rem; cursor: grab; transition: all 0.15s; }
.prio-chip:hover { box-shadow: var(--shadow-sm); }
.prio-chip:active { cursor: grabbing; }
.prio-empty-hint { font-size: 0.78rem; color: var(--text-muted); padding: 8px; }

.matrix { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
.matrix-quad { background: var(--bg-card); border: 1px solid var(--border); border-radius: var(--radius-md); padding: 16px; min-height: 200px; transition: all 0.2s; }
.matrix-quad:hover { border-color: var(--border); }
.matrix-quad.urgent_important { border-top: 3px solid var(--red); }
.matrix-quad.important { border-top: 3px solid var(--blue); }
.matrix-quad.urgent { border-top: 3px solid var(--amber); }
.matrix-quad.not_urgent { border-top: 3px solid var(--text-muted); }

.mq-header { margin-bottom: 12px; }
.mq-header strong { font-size: 0.9rem; display: block; }
.mq-desc { font-size: 0.72rem; color: var(--text-muted); }

.mq-tasks { display: flex; flex-direction: column; gap: 6px; }
.mq-card { display: flex; align-items: center; gap: 8px; padding: 10px; border: 1px solid var(--border-light); border-radius: var(--radius-sm); cursor: grab; transition: all 0.15s; }
.mq-card:hover { background: var(--bg-hover); box-shadow: var(--shadow-sm); }
.mq-card:active { cursor: grabbing; }
.mq-status { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
.mq-status.todo { background: var(--text-muted); }
.mq-status.in_progress { background: var(--blue); }
.mq-status.blocked { background: var(--red); }
.mq-info { flex: 1; min-width: 0; }
.mq-info strong { font-size: 0.82rem; display: block; }
.mq-client { font-size: 0.68rem; color: var(--purple); background: var(--purple-bg); padding: 1px 6px; border-radius: 4px; }
.mq-due { font-size: 0.7rem; color: var(--text-muted); flex-shrink: 0; }
.mq-due.late { color: var(--red); font-weight: 600; }
.mq-empty { text-align: center; padding: 20px; color: var(--text-muted); font-size: 0.82rem; }

@media (max-width: 768px) { .matrix { grid-template-columns: 1fr; } }
</style>

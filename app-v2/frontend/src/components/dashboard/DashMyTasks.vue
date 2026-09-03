<template>
  <div class="dash-card">
    <div class="card-header">
      <h2>{{ t('dash_my_tasks') }}</h2>
      <router-link to="/app/tasks/kanban" class="card-link">{{ t('dash_view_all') }} →</router-link>
    </div>

    <div class="task-tabs">
      <button
        v-for="tab in taskTabs"
        :key="tab.key"
        class="task-tab"
        :class="{ active: activeTab === tab.key }"
        @click="$emit('tab-change', tab.key)"
      >
        {{ t(tab.label) }} <span class="tab-count">{{ tab.count }}</span>
      </button>
    </div>

    <div class="task-list">
      <div
        v-for="task in filteredTasks"
        :key="task.id"
        class="task-item"
        :class="{ overdue: isOverdue(task) }"
        @click="$router.push('/app/tasks/kanban')"
      >
        <span class="task-status-dot" :class="task.status" />
        <div class="task-info">
          <strong>{{ task.title }}</strong>
          <div class="task-meta">
            <span v-if="task.clientId" class="task-client">{{ clientName(task.clientId) }}</span>
            <span v-if="task.dueDate" class="task-due" :class="{ late: isOverdue(task) }">
              📅 {{ formatDate(task.dueDate) }}
            </span>
          </div>
        </div>
        <span v-if="task.priority === 'urgent'" class="priority-badge urgent">🔴</span>
      </div>
      <div v-if="!filteredTasks.length" class="empty-state">{{ t('no_data') }}</div>
    </div>
  </div>
</template>

<script setup>
import { useI18n } from 'vue-i18n'
import { fmtDate } from '@/lib/formatters'

const { t } = useI18n({ useScope: 'global' })

const props = defineProps({
  filteredTasks: { type: Array, default: () => [] },
  taskTabs:      { type: Array, default: () => [] },
  activeTab:     { type: String, default: 'all' },
  clientsMap:    { type: Object, default: () => ({}) }
})

defineEmits(['tab-change'])

function isOverdue(task) {
  if (!task.dueDate || task.status === 'done') return false
  return new Date(task.dueDate) < new Date()
}

function clientName(id) {
  return props.clientsMap[id] || id
}

// DATE-RAW: central formatter (short day + month variant, language = i18n.global)
function formatDate(d) {
  return d ? fmtDate(d, { day: 'numeric', month: 'short' }) : ''
}
</script>

<style scoped>
.dash-card { background: var(--card-bg); border: 1px solid var(--border); border-radius: var(--radius); padding: 20px; }
.card-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; }
.card-header h2 { font-size: 0.9rem; font-weight: 700; color: var(--text); }
.card-link { font-size: 0.78rem; color: var(--primary); text-decoration: none; font-weight: 500; }
.task-tabs { display: flex; gap: 4px; margin-bottom: 12px; }
.task-tab { font-size: 0.78rem; padding: 4px 10px; border-radius: 6px; border: none; background: transparent; color: var(--text-secondary); cursor: pointer; transition: all 0.15s; }
.task-tab.active { background: var(--primary); color: #fff; }
.tab-count { font-size: 0.68rem; opacity: 0.7; margin-left: 4px; background: rgba(0,0,0,0.06); padding: 1px 5px; border-radius: 8px; }
.task-tab.active .tab-count { background: rgba(255,255,255,0.12); }
.task-list { display: flex; flex-direction: column; gap: 4px; max-height: 300px; overflow-y: auto; }
.task-item { display: flex; align-items: center; gap: 10px; padding: 8px; border-radius: var(--radius-sm); cursor: pointer; transition: background 0.15s; }
.task-item:hover { background: var(--bg-hover); }
.task-item.overdue { background: var(--red-bg); }
.task-status-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
.task-status-dot.todo { background: var(--text-muted); }
.task-status-dot.in_progress { background: var(--primary); }
.task-status-dot.blocked { background: var(--red); }
.task-info { flex: 1; min-width: 0; }
.task-info strong { font-size: 0.82rem; display: block; color: var(--text); }
.task-meta { display: flex; gap: 10px; margin-top: 2px; font-size: 0.72rem; color: var(--text-muted); }
.task-client { max-width: 120px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.task-due.late { color: var(--red); font-weight: 600; }
.priority-badge.urgent { font-size: 0.7rem; }
.empty-state { font-size: 0.82rem; color: var(--text-muted); padding: 16px; text-align: center; }
</style>
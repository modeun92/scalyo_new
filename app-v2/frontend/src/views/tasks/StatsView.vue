<template>
  <div class="stats_view">
    <h1>📊 {{ t('sm_stats_title') }}</h1>

    <EmptyState v-if="store.tasks.length === 0" icon="✅" title-key="empty_tasks_title" desc-key="empty_tasks_desc" cta-key="empty_tasks_cta" :cta-action="() => $router.push('/app/tasks/kanban')" />

    <template v-else>

    <!-- AI Prediction Panel -->
    <div class="ai_panel" :class="'ai_' + pred.riskLabel">
      <div class="ai_header">
        <span class="ai_icon">🤖</span>
        <h2>{{ t('sm_ai_title') }}</h2>
        <span class="ai_risk" :class="'risk_' + pred.riskLabel">
          {{ pred.riskLabel === 'critical' ? '🔴 ' + t('sm_risk_critical') : pred.riskLabel === 'warning' ? '🟡 ' + t('sm_risk_warning') : '🟢 ' + t('sm_risk_healthy') }}
          ({{ pred.riskScore }}/100)
        </span>
      </div>
      <!-- STATS-N1 (29/08): < 3 completed tasks → "not enough data" state instead
           of the predictions (the store returns null, R21). Completion, delays and blockers stay real. -->
      <div v-if="pred.insufficientData" class="ai_insufficient">
        📉 {{ t('sm_pred_insufficient', { n: pred.doneCount }) }}
      </div>
      <div v-else class="ai_grid">
        <div class="ai_metric">
          <span class="aim_value">{{ pred.velocityPerWeek ?? '—' }}</span>
          <span class="aim_label">{{ t('sm_velocity_unit') }}</span>
        </div>
        <div class="ai_metric">
          <span class="aim_value">{{ pred.completionPercent }}%</span>
          <span class="aim_label">{{ t('sm_delivery_rate') }}</span>
        </div>
        <div class="ai_metric">
          <span class="aim_value">{{ pred.weeksToComplete || '—' }}</span>
          <span class="aim_label">{{ t('sm_weeks_remaining') }}</span>
        </div>
        <div class="ai_metric">
          <span class="aim_value">{{ pred.estimatedDate ? fmtDate(pred.estimatedDate) : '—' }}</span>
          <span class="aim_label">{{ t('sm_est_completion') }}</span>
        </div>
      </div>
      <div v-if="pred.recommendations.length" class="ai_recs">
        <div v-for="(rec, i) in pred.recommendations" :key="i" class="ai_rec" :class="'recommendation_' + rec.type">
          {{ rec.type === 'danger' ? '🔴' : rec.type === 'warning' ? '🟡' : rec.type === 'success' ? '🟢' : '💡' }}
          {{ t(rec.key, rec.params) }}
        </div>
      </div>
    </div>

    <!-- KPI cards -->
    <div class="status_kpis">
      <div class="stk"><span class="stats_kpi_icon">🎯</span><span class="stats_kpi_value">{{ pred.velocityPerWeek ?? '—' }}</span><span class="stats_kpi_label">{{ t('sm_velocity') }}</span><span class="stats_kpi_sub">{{ t('sm_velocity_unit') }}</span></div>
      <div class="stk"><span class="stats_kpi_icon">⏱</span><span class="stats_kpi_value">{{ pred.hoursAccuracy || 0 }}%</span><span class="stats_kpi_label">{{ t('sm_estimation_acc') }}</span></div>
      <div class="stk warn"><span class="stats_kpi_icon">🔴</span><span class="stats_kpi_value red">{{ pred.overdueCount }}</span><span class="stats_kpi_label">{{ t('sm_overdue') }}</span></div>
      <div class="stk"><span class="stats_kpi_icon">✅</span><span class="stats_kpi_value green">{{ pred.completionPercent }}%</span><span class="stats_kpi_label">{{ t('sm_delivery_rate') }}</span></div>
    </div>

    <!-- Charts row -->
    <div class="status_charts">
      <div class="status_card">
        <h3>{{ t('sm_by_status') }}</h3>
        <apexchart type="donut" height="260" :options="donutOpts" :series="donutSeries" />
      </div>
      <div class="status_card">
        <h3>{{ t('sm_project_progress') }}</h3>
        <apexchart type="bar" height="260" :options="barOpts" :series="barSeries" />
      </div>
      <div class="status_card">
        <h3>{{ t('sm_hours_chart') }}</h3>
        <apexchart type="bar" height="260" :options="hoursOpts" :series="hoursSeries" />
      </div>
    </div>

    <!-- Tables row -->
    <div class="status_tables">
      <div class="status_card">
        <h3>{{ t('sm_top_late') }}</h3>
        <div v-if="store.overdueTasks.length" class="status_table">
          <div v-for="task in store.overdueTasks.slice(0, 5)" :key="task.id" class="stats_table_row">
            <span class="stats_table_title">{{ task.title }}</span>
            <span class="stats_table_delay red">+{{ daysLate(task) }}j</span>
            <span class="stats_table_assignee">{{ task.assignee || '—' }}</span>
          </div>
        </div>
        <div v-else class="stats_table_empty">{{ t('sm_no_late') }} 🎉</div>
      </div>
      <div class="status_card">
        <h3>{{ t('sm_estimation_analysis') }}</h3>
        <div v-if="tasksWithHours.length" class="status_table">
          <div v-for="task in tasksWithHours" :key="task.id" class="stats_table_row">
            <span class="stats_table_title">{{ task.title }}</span>
            <span class="stats_table_hours">{{ task.actualHours || 0 }}h / {{ task.expectedHours || 0 }}h</span>
            <span class="stats_table_delta" :class="hoursDelta(task) > 0 ? 'red' : 'green'">{{ hoursDelta(task) > 0 ? '+' : '' }}{{ hoursDelta(task) }}%</span>
          </div>
        </div>
        <div v-else class="stats_table_empty">{{ t('sm_no_hours') }}</div>
      </div>
    </div>
      </template>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useTaskStore } from '@/stores/tasks'
import EmptyState from '@/components/EmptyState.vue'
import { fmtDate } from '@/lib/formatters' // DATE-RAW

const { t } = useI18n({ useScope: 'global' })
const store = useTaskStore()

// Use store predictions
const pred = computed(() => store.predictions)

// Donut chart — use tasksByStatus from store
const donutSeries = computed(() => [
  store.tasksByStatus.todo.length,
  store.tasksByStatus.in_progress.length,
  store.tasksByStatus.blocked.length,
  store.tasksByStatus.done.length,
])

const donutOpts = computed(() => ({
  chart: { type: 'donut', fontFamily: 'Inter, sans-serif' },
  labels: [t('status_todo'), t('status_in_progress'), t('status_blocked'), t('status_done')],
  colors: ['#9ca3af', '#3b82f6', '#ef4444', '#10b981'],
  legend: { position: 'bottom', fontSize: '12px' },
  dataLabels: { enabled: true, style: { fontSize: '11px' } },
  plotOptions: { pie: { donut: { size: '55%', labels: { show: true, total: { show: true, label: t('sm_chart_total'), fontSize: '12px', fontWeight: 600 } } } } },
}))

// Bar chart: project progress
const barSeries = computed(() => [{
  name: t('sm_series_completion'),
  data: store.projects.map(p => {
    const pTasks = store.tasks.filter(t => t.projectId === p.id)
    const done = pTasks.filter(t => t.finished || t.status === 'done').length
    return pTasks.length ? Math.round((done / pTasks.length) * 100) : 0
  }),
}])

const barOpts = computed(() => ({
  chart: { type: 'bar', fontFamily: 'Inter, sans-serif', toolbar: { show: false } },
  plotOptions: { bar: { horizontal: true, borderRadius: 6, barHeight: '50%' } },
  xaxis: { categories: store.projects.map(p => p.name || p.title), max: 100 },
  colors: ['#7c3aed'],
  dataLabels: { enabled: true, formatter: (v) => v + '%', style: { fontSize: '11px' } },
  grid: { borderColor: '#f3f4f6' },
}))

// Hours comparison chart
const hoursSeries = computed(() => {
  const projs = store.projects.slice(0, 6)
  return [
    { name: t('sm_series_expected'), data: projs.map(p => {
      return store.tasks.filter(t => t.projectId === p.id).reduce((s, t) => s + (t.expectedHours || 0), 0)
    })},
    { name: t('sm_series_actual'), data: projs.map(p => {
      return store.tasks.filter(t => t.projectId === p.id).reduce((s, t) => s + (t.actualHours || 0), 0)
    })},
  ]
})

const hoursOpts = computed(() => ({
  chart: { type: 'bar', fontFamily: 'Inter, sans-serif', toolbar: { show: false } },
  plotOptions: { bar: { borderRadius: 4, columnWidth: '60%' } },
  xaxis: { categories: store.projects.slice(0, 6).map(p => p.name || p.title) },
  colors: ['#d1d5db', '#7c3aed'],
  dataLabels: { enabled: false },
  grid: { borderColor: '#f3f4f6' },
  legend: { position: 'top', fontSize: '11px' },
}))

// Helpers
const tasksWithHours = computed(() => store.tasks.filter(t => t.expectedHours > 0).slice(0, 5))

function daysLate(task) {
  const due = new Date(task.endDate || task.dueDate)
  const now = new Date()
  return Math.max(0, Math.round((now - due) / 86400000))
}

function hoursDelta(task) {
  if (!task.expectedHours) return 0
  return Math.round(((task.actualHours || 0) - task.expectedHours) / task.expectedHours * 100)
}
</script>

<style scoped>
.stats_view { max-width: 1100px; }
.stats_view h1 { font-size: 1.5rem; font-weight: 800; margin-bottom: 24px; }

/* AI Panel */
.ai_panel { background: var(--bg-card); border: 1px solid var(--border); border-radius: var(--radius-md); padding: 20px; margin-bottom: 24px; border-left: 4px solid var(--green); }
.ai_panel.ai_warning { border-left-color: var(--amber); }
.ai_panel.ai_critical { border-left-color: var(--red); }
.ai_header { display: flex; align-items: center; gap: 10px; margin-bottom: 16px; }
.ai_icon { font-size: 1.3rem; }
.ai_header h2 { font-size: 1rem; font-weight: 700; flex: 1; margin: 0; }
.ai_risk { font-size: 0.78rem; font-weight: 600; padding: 4px 12px; border-radius: 99px; }
.risk_healthy { background: var(--green-bg); color: var(--green); }
.risk_warning { background: var(--amber-bg); color: var(--amber); }
.risk_critical { background: var(--red-bg); color: var(--red); }
.ai_grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; margin-bottom: 12px; }
.ai_insufficient { padding: 14px 16px; margin-bottom: 12px; background: var(--bg-hover, rgba(0,0,0,0.03)); border-radius: var(--radius-sm); color: var(--text-secondary); font-size: 0.9rem; }
.ai_metric { text-align: center; }
.aim_value { font-size: 1.4rem; font-weight: 800; display: block; color: var(--text); }
.aim_label { font-size: 0.68rem; color: var(--text-muted); }
.ai_recs { display: flex; flex-direction: column; gap: 6px; }
.ai_rec { font-size: 0.78rem; padding: 8px 12px; border-radius: 6px; background: var(--bg); }
.recommendation_danger { background: var(--red-bg); color: var(--red); }
.recommendation_warning { background: var(--amber-bg); color: var(--amber); }
.recommendation_success { background: var(--green-bg); color: var(--green); }
.recommendation_info { background: var(--blue-bg); color: var(--blue); }

/* KPI cards */
.status_kpis { display: grid; grid-template-columns: repeat(4, 1fr); gap: 14px; margin-bottom: 24px; }
.stk { background: var(--bg-card); border: 1px solid var(--border); border-radius: var(--radius-md); padding: 18px; text-align: center; transition: all 0.2s; }
.stk:hover { box-shadow: var(--shadow-sm); transform: translateY(-2px); }
.stk.warn { border-left: 3px solid var(--red); }
.stats_kpi_icon { font-size: 1.3rem; display: block; margin-bottom: 6px; }
.stats_kpi_value { font-size: 1.8rem; font-weight: 800; display: block; }
.stats_kpi_value.green { color: var(--green); }
.stats_kpi_value.red { color: var(--red); }
.stats_kpi_label { font-size: 0.72rem; color: var(--text-secondary); display: block; }
.stats_kpi_sub { font-size: 0.65rem; color: var(--text-muted); }

/* Charts */
.status_charts { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 18px; margin-bottom: 24px; }
.status_card { background: var(--bg-card); border: 1px solid var(--border); border-radius: var(--radius-md); padding: 20px; }
.status_card h3 { font-size: 0.88rem; font-weight: 700; margin-bottom: 12px; }

/* Tables */
.status_tables { display: grid; grid-template-columns: 1fr 1fr; gap: 18px; }
.status_table { display: flex; flex-direction: column; gap: 6px; }
.stats_table_row { display: flex; align-items: center; gap: 10px; padding: 8px 10px; background: var(--bg); border-radius: 6px; font-size: 0.82rem; }
.stats_table_title { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.stats_table_delay { font-weight: 700; font-size: 0.78rem; }
.stats_table_assignee { font-size: 0.75rem; color: var(--text-muted); min-width: 70px; text-align: right; }
.stats_table_hours { font-size: 0.78rem; color: var(--text-muted); }
.stats_table_delta { font-size: 0.78rem; font-weight: 600; min-width: 40px; text-align: right; }
.red { color: var(--red); }
.green { color: var(--green); }
.stats_table_empty { text-align: center; padding: 20px; color: var(--text-muted); font-size: 0.85rem; }

@media (max-width: 1024px) { .status_charts { grid-template-columns: 1fr 1fr; } .ai_grid { grid-template-columns: repeat(2, 1fr); } }
@media (max-width: 768px) { .status_kpis { grid-template-columns: repeat(2, 1fr); } .status_charts, .status_tables { grid-template-columns: 1fr; } .ai_grid { grid-template-columns: repeat(2, 1fr); } }
</style>
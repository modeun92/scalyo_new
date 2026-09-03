<template>
  <div class="stats-view">
    <h1>📊 {{ t('sm_stats_title') }}</h1>

    <EmptyState v-if="store.tasks.length === 0" icon="✅" title-key="empty_tasks_title" desc-key="empty_tasks_desc" cta-key="empty_tasks_cta" :cta-action="() => $router.push('/app/tasks/kanban')" />

    <template v-else>

    <!-- AI Prediction Panel -->
    <div class="ai-panel" :class="'ai-' + pred.riskLabel">
      <div class="ai-header">
        <span class="ai-icon">🤖</span>
        <h2>{{ t('sm_ai_title') }}</h2>
        <span class="ai-risk" :class="'risk-' + pred.riskLabel">
          {{ pred.riskLabel === 'critical' ? '🔴 ' + t('sm_risk_critical') : pred.riskLabel === 'warning' ? '🟡 ' + t('sm_risk_warning') : '🟢 ' + t('sm_risk_healthy') }}
          ({{ pred.riskScore }}/100)
        </span>
      </div>
      <!-- STATS-N1 (29/08): < 3 completed tasks → "not enough data" state instead
           of the predictions (the store returns null, R21). Completion, delays and blockers stay real. -->
      <div v-if="pred.insufficientData" class="ai-insufficient">
        📉 {{ t('sm_pred_insufficient', { n: pred.doneCount }) }}
      </div>
      <div v-else class="ai-grid">
        <div class="ai-metric">
          <span class="aim-val">{{ pred.velocityPerWeek ?? '—' }}</span>
          <span class="aim-lbl">{{ t('sm_velocity_unit') }}</span>
        </div>
        <div class="ai-metric">
          <span class="aim-val">{{ pred.completionPercent }}%</span>
          <span class="aim-lbl">{{ t('sm_delivery_rate') }}</span>
        </div>
        <div class="ai-metric">
          <span class="aim-val">{{ pred.weeksToComplete || '—' }}</span>
          <span class="aim-lbl">{{ t('sm_weeks_remaining') }}</span>
        </div>
        <div class="ai-metric">
          <span class="aim-val">{{ pred.estimatedDate ? fmtDate(pred.estimatedDate) : '—' }}</span>
          <span class="aim-lbl">{{ t('sm_est_completion') }}</span>
        </div>
      </div>
      <div v-if="pred.recommendations.length" class="ai-recs">
        <div v-for="(rec, i) in pred.recommendations" :key="i" class="ai-rec" :class="'rec-' + rec.type">
          {{ rec.type === 'danger' ? '🔴' : rec.type === 'warning' ? '🟡' : rec.type === 'success' ? '🟢' : '💡' }}
          {{ t(rec.key, rec.params) }}
        </div>
      </div>
    </div>

    <!-- KPI cards -->
    <div class="st-kpis">
      <div class="stk"><span class="stk-icon">🎯</span><span class="stk-val">{{ pred.velocityPerWeek ?? '—' }}</span><span class="stk-lbl">{{ t('sm_velocity') }}</span><span class="stk-sub">{{ t('sm_velocity_unit') }}</span></div>
      <div class="stk"><span class="stk-icon">⏱</span><span class="stk-val">{{ pred.hoursAccuracy || 0 }}%</span><span class="stk-lbl">{{ t('sm_estimation_acc') }}</span></div>
      <div class="stk warn"><span class="stk-icon">🔴</span><span class="stk-val red">{{ pred.overdueCount }}</span><span class="stk-lbl">{{ t('sm_overdue') }}</span></div>
      <div class="stk"><span class="stk-icon">✅</span><span class="stk-val green">{{ pred.completionPercent }}%</span><span class="stk-lbl">{{ t('sm_delivery_rate') }}</span></div>
    </div>

    <!-- Charts row -->
    <div class="st-charts">
      <div class="st-card">
        <h3>{{ t('sm_by_status') }}</h3>
        <apexchart type="donut" height="260" :options="donutOpts" :series="donutSeries" />
      </div>
      <div class="st-card">
        <h3>{{ t('sm_project_progress') }}</h3>
        <apexchart type="bar" height="260" :options="barOpts" :series="barSeries" />
      </div>
      <div class="st-card">
        <h3>{{ t('sm_hours_chart') }}</h3>
        <apexchart type="bar" height="260" :options="hoursOpts" :series="hoursSeries" />
      </div>
    </div>

    <!-- Tables row -->
    <div class="st-tables">
      <div class="st-card">
        <h3>{{ t('sm_top_late') }}</h3>
        <div v-if="store.overdueTasks.length" class="st-table">
          <div v-for="task in store.overdueTasks.slice(0, 5)" :key="task.id" class="stt-row">
            <span class="stt-title">{{ task.title }}</span>
            <span class="stt-delay red">+{{ daysLate(task) }}j</span>
            <span class="stt-assignee">{{ task.assignee || '—' }}</span>
          </div>
        </div>
        <div v-else class="stt-empty">{{ t('sm_no_late') }} 🎉</div>
      </div>
      <div class="st-card">
        <h3>{{ t('sm_estimation_analysis') }}</h3>
        <div v-if="tasksWithHours.length" class="st-table">
          <div v-for="task in tasksWithHours" :key="task.id" class="stt-row">
            <span class="stt-title">{{ task.title }}</span>
            <span class="stt-hours">{{ task.actualHours || 0 }}h / {{ task.expectedHours || 0 }}h</span>
            <span class="stt-delta" :class="hoursDelta(task) > 0 ? 'red' : 'green'">{{ hoursDelta(task) > 0 ? '+' : '' }}{{ hoursDelta(task) }}%</span>
          </div>
        </div>
        <div v-else class="stt-empty">{{ t('sm_no_hours') }}</div>
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
.stats-view { max-width: 1100px; }
.stats-view h1 { font-size: 1.5rem; font-weight: 800; margin-bottom: 24px; }

/* AI Panel */
.ai-panel { background: var(--bg-card); border: 1px solid var(--border); border-radius: var(--radius-md); padding: 20px; margin-bottom: 24px; border-left: 4px solid var(--green); }
.ai-panel.ai-warning { border-left-color: var(--amber); }
.ai-panel.ai-critical { border-left-color: var(--red); }
.ai-header { display: flex; align-items: center; gap: 10px; margin-bottom: 16px; }
.ai-icon { font-size: 1.3rem; }
.ai-header h2 { font-size: 1rem; font-weight: 700; flex: 1; margin: 0; }
.ai-risk { font-size: 0.78rem; font-weight: 600; padding: 4px 12px; border-radius: 99px; }
.risk-healthy { background: var(--green-bg); color: var(--green); }
.risk-warning { background: var(--amber-bg); color: var(--amber); }
.risk-critical { background: var(--red-bg); color: var(--red); }
.ai-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; margin-bottom: 12px; }
.ai-insufficient { padding: 14px 16px; margin-bottom: 12px; background: var(--bg-hover, rgba(0,0,0,0.03)); border-radius: var(--radius-sm); color: var(--text-secondary); font-size: 0.9rem; }
.ai-metric { text-align: center; }
.aim-val { font-size: 1.4rem; font-weight: 800; display: block; color: var(--text); }
.aim-lbl { font-size: 0.68rem; color: var(--text-muted); }
.ai-recs { display: flex; flex-direction: column; gap: 6px; }
.ai-rec { font-size: 0.78rem; padding: 8px 12px; border-radius: 6px; background: var(--bg); }
.rec-danger { background: var(--red-bg); color: var(--red); }
.rec-warning { background: var(--amber-bg); color: var(--amber); }
.rec-success { background: var(--green-bg); color: var(--green); }
.rec-info { background: var(--blue-bg); color: var(--blue); }

/* KPI cards */
.st-kpis { display: grid; grid-template-columns: repeat(4, 1fr); gap: 14px; margin-bottom: 24px; }
.stk { background: var(--bg-card); border: 1px solid var(--border); border-radius: var(--radius-md); padding: 18px; text-align: center; transition: all 0.2s; }
.stk:hover { box-shadow: var(--shadow-sm); transform: translateY(-2px); }
.stk.warn { border-left: 3px solid var(--red); }
.stk-icon { font-size: 1.3rem; display: block; margin-bottom: 6px; }
.stk-val { font-size: 1.8rem; font-weight: 800; display: block; }
.stk-val.green { color: var(--green); }
.stk-val.red { color: var(--red); }
.stk-lbl { font-size: 0.72rem; color: var(--text-secondary); display: block; }
.stk-sub { font-size: 0.65rem; color: var(--text-muted); }

/* Charts */
.st-charts { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 18px; margin-bottom: 24px; }
.st-card { background: var(--bg-card); border: 1px solid var(--border); border-radius: var(--radius-md); padding: 20px; }
.st-card h3 { font-size: 0.88rem; font-weight: 700; margin-bottom: 12px; }

/* Tables */
.st-tables { display: grid; grid-template-columns: 1fr 1fr; gap: 18px; }
.st-table { display: flex; flex-direction: column; gap: 6px; }
.stt-row { display: flex; align-items: center; gap: 10px; padding: 8px 10px; background: var(--bg); border-radius: 6px; font-size: 0.82rem; }
.stt-title { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.stt-delay { font-weight: 700; font-size: 0.78rem; }
.stt-assignee { font-size: 0.75rem; color: var(--text-muted); min-width: 70px; text-align: right; }
.stt-hours { font-size: 0.78rem; color: var(--text-muted); }
.stt-delta { font-size: 0.78rem; font-weight: 600; min-width: 40px; text-align: right; }
.red { color: var(--red); }
.green { color: var(--green); }
.stt-empty { text-align: center; padding: 20px; color: var(--text-muted); font-size: 0.85rem; }

@media (max-width: 1024px) { .st-charts { grid-template-columns: 1fr 1fr; } .ai-grid { grid-template-columns: repeat(2, 1fr); } }
@media (max-width: 768px) { .st-kpis { grid-template-columns: repeat(2, 1fr); } .st-charts, .st-tables { grid-template-columns: 1fr; } .ai-grid { grid-template-columns: repeat(2, 1fr); } }
</style>
<template>
  <div class="team-view">
    <h1>👥 {{ t('sm_team_title') }}</h1>
    <div class="tm-list">
      <div v-for="m in team.members" :key="m.id" class="tm-card">
        <div class="tmc-header">
          <div class="tmc-avatar" :class="m.status">{{ m.name[0] }}</div>
          <div class="tmc-info">
            <strong>{{ m.name }}</strong>
            <span>{{ m.role }} · {{ m.email }}</span>
          </div>
          <span class="tmc-status" :class="m.status">{{ m.status === 'healthy' ? t('status_healthy') : t('kpi_overloaded') }}</span>
        </div>
        <div class="tmc-stats">
          <div class="tms"><span class="tms-val">{{ memberTasks(m.id).length }}</span><span class="tms-lbl">{{ t('sm_assigned_tasks') }}</span></div>
          <div class="tms"><span class="tms-val">{{ memberTasks(m.id).filter(t => t.status === 'done').length }}</span><span class="tms-lbl">{{ t('sm_completed') }}</span></div>
          <div class="tms"><span class="tms-val red">{{ memberTasks(m.id).filter(t => isOverdue(t)).length }}</span><span class="tms-lbl">{{ t('sm_overdue') }}</span></div>
        </div>
        <div class="tmc-tasks">
          <div v-for="task in memberTasks(m.id).filter(t => t.status !== 'done').slice(0, 5)" :key="task.id" class="tmt-row">
            <span class="tmt-dot" :class="task.status" />
            <span class="tmt-title">{{ task.title }}</span>
            <span class="tmt-badge" :class="task.status">{{ t('status_' + task.status) }}</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { useI18n } from 'vue-i18n'
import { useTeamStore } from '@/stores/team'
import { useTaskStore } from '@/stores/tasks'
const { t } = useI18n({ useScope: 'global' })
const team = useTeamStore()
const tasks = useTaskStore()
function memberTasks(id) { return tasks.tasks.filter(t => t.assignee === id) }
function isOverdue(task) { return task.status !== 'done' && task.dueDate < new Date().toISOString().slice(0, 10) }
</script>

<style scoped>
.team-view { max-width: 900px; }
.team-view h1 { font-size: 1.5rem; font-weight: 800; margin-bottom: 24px; }
.tm-list { display: flex; flex-direction: column; gap: 16px; }
.tm-card { background: var(--bg-card); border: 1px solid var(--border); border-radius: var(--radius-md); padding: 20px; }
.tmc-header { display: flex; align-items: center; gap: 12px; margin-bottom: 16px; }
.tmc-avatar { width: 40px; height: 40px; border-radius: 50%; display: flex; align-items: center; justify-content: center; color: #fff; font-weight: 700; font-size: 1rem; flex-shrink: 0; }
.tmc-avatar.healthy { background: var(--green); }
.tmc-avatar.overloaded { background: var(--red); }
.tmc-info { flex: 1; }
.tmc-info strong { font-size: 0.95rem; display: block; }
.tmc-info span { font-size: 0.75rem; color: var(--text-muted); }
.tmc-status { font-size: 0.72rem; font-weight: 600; padding: 4px 12px; border-radius: 6px; }
.tmc-status.healthy { background: var(--green-bg); color: var(--green); }
.tmc-status.overloaded { background: var(--red-bg); color: var(--red); }
.tmc-stats { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-bottom: 14px; }
.tms { background: var(--bg); border-radius: var(--radius-sm); padding: 10px; text-align: center; }
.tms-val { font-size: 1.2rem; font-weight: 700; display: block; }
.tms-val.red { color: var(--red); }
.tms-lbl { font-size: 0.68rem; color: var(--text-secondary); }
.tmc-tasks { display: flex; flex-direction: column; gap: 4px; }
.tmt-row { display: flex; align-items: center; gap: 8px; padding: 6px 8px; border-radius: 6px; }
.tmt-row:hover { background: var(--bg-hover); }
.tmt-dot { width: 6px; height: 6px; border-radius: 50%; flex-shrink: 0; }
.tmt-dot.todo { background: var(--text-muted); }
.tmt-dot.in_progress { background: var(--blue); }
.tmt-dot.blocked { background: var(--red); }
.tmt-title { flex: 1; font-size: 0.82rem; }
.tmt-badge { font-size: 0.65rem; font-weight: 600; padding: 2px 8px; border-radius: 4px; }
.tmt-badge.todo { background: var(--bg); color: var(--text-muted); }
.tmt-badge.in_progress { background: var(--blue-bg); color: var(--blue); }
.tmt-badge.blocked { background: var(--red-bg); color: var(--red); }
</style>

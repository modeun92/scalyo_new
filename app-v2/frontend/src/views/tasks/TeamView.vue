<template>
  <div class="team_view">
    <h1>👥 {{ t('sm_team_title') }}</h1>
    <div class="tm_list">
      <div v-for="m in team.members" :key="m.id" class="tm_card">
        <div class="team_card_header">
          <div class="team_card_avatar" :class="m.status">{{ m.name[0] }}</div>
          <div class="team_card_info">
            <strong>{{ m.name }}</strong>
            <span>{{ m.role }} · {{ m.email }}</span>
          </div>
          <span class="team_card_status" :class="m.status">{{ m.status === 'healthy' ? t('status_healthy') : t('kpi_overloaded') }}</span>
        </div>
        <div class="team_card_stats">
          <div class="tms"><span class="tms_value">{{ memberTasks(m.id).length }}</span><span class="tms_label">{{ t('sm_assigned_tasks') }}</span></div>
          <div class="tms"><span class="tms_value">{{ memberTasks(m.id).filter(t => t.status === 'done').length }}</span><span class="tms_label">{{ t('sm_completed') }}</span></div>
          <div class="tms"><span class="tms_value red">{{ memberTasks(m.id).filter(t => isOverdue(t)).length }}</span><span class="tms_label">{{ t('sm_overdue') }}</span></div>
        </div>
        <div class="team_card_tasks">
          <div v-for="task in memberTasks(m.id).filter(t => t.status !== 'done').slice(0, 5)" :key="task.id" class="team_table_row">
            <span class="team_table_dot" :class="task.status" />
            <span class="team_table_title">{{ task.title }}</span>
            <span class="team_table_badge" :class="task.status">{{ t('status_' + task.status) }}</span>
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
.team_view { max-width: 900px; }
.team_view h1 { font-size: 1.5rem; font-weight: 800; margin-bottom: 24px; }
.tm_list { display: flex; flex-direction: column; gap: 16px; }
.tm_card { background: var(--bg-card); border: 1px solid var(--border); border-radius: var(--radius-md); padding: 20px; }
.team_card_header { display: flex; align-items: center; gap: 12px; margin-bottom: 16px; }
.team_card_avatar { width: 40px; height: 40px; border-radius: 50%; display: flex; align-items: center; justify-content: center; color: #fff; font-weight: 700; font-size: 1rem; flex-shrink: 0; }
.team_card_avatar.healthy { background: var(--green); }
.team_card_avatar.overloaded { background: var(--red); }
.team_card_info { flex: 1; }
.team_card_info strong { font-size: 0.95rem; display: block; }
.team_card_info span { font-size: 0.75rem; color: var(--text-muted); }
.team_card_status { font-size: 0.72rem; font-weight: 600; padding: 4px 12px; border-radius: 6px; }
.team_card_status.healthy { background: var(--green-bg); color: var(--green); }
.team_card_status.overloaded { background: var(--red-bg); color: var(--red); }
.team_card_stats { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-bottom: 14px; }
.tms { background: var(--bg); border-radius: var(--radius-sm); padding: 10px; text-align: center; }
.tms_value { font-size: 1.2rem; font-weight: 700; display: block; }
.tms_value.red { color: var(--red); }
.tms_label { font-size: 0.68rem; color: var(--text-secondary); }
.team_card_tasks { display: flex; flex-direction: column; gap: 4px; }
.team_table_row { display: flex; align-items: center; gap: 8px; padding: 6px 8px; border-radius: 6px; }
.team_table_row:hover { background: var(--bg-hover); }
.team_table_dot { width: 6px; height: 6px; border-radius: 50%; flex-shrink: 0; }
.team_table_dot.todo { background: var(--text-muted); }
.team_table_dot.in_progress { background: var(--blue); }
.team_table_dot.blocked { background: var(--red); }
.team_table_title { flex: 1; font-size: 0.82rem; }
.team_table_badge { font-size: 0.65rem; font-weight: 600; padding: 2px 8px; border-radius: 4px; }
.team_table_badge.todo { background: var(--bg); color: var(--text-muted); }
.team_table_badge.in_progress { background: var(--blue-bg); color: var(--blue); }
.team_table_badge.blocked { background: var(--red-bg); color: var(--red); }
</style>

<template>
  <div class="settings_view_panel">
    <div class="settings_view_section">
      <h3>{{ t('stg_tab_team') }}</h3>
      <div class="team_list">
        <div v-for="m in team.members" :key="m.id" class="team_row">
          <div class="table_row_avatar" :class="m.status">{{ m.name[0] }}</div>
          <div class="table_row_info">
            <strong>{{ m.name }}</strong>
            <span>{{ m.email }} · {{ m.role }}</span>
          </div>
          <span class="table_row_status" :class="m.status">
            {{ m.status === 'healthy' ? t('status_healthy') : t('kpi_overloaded') }}
          </span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { useI18n } from 'vue-i18n'
import { useTeamStore } from '@/stores/team'

const { t } = useI18n({ useScope: 'global' })
const team = useTeamStore()
</script>

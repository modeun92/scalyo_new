<template>
  <div class="sv-panel">
    <div class="sv-section">
      <h3>{{ t('stg_tab_team') }}</h3>
      <div class="team-list">
        <div v-for="m in team.members" :key="m.id" class="team-row">
          <div class="tr-avatar" :class="m.status">{{ m.name[0] }}</div>
          <div class="tr-info">
            <strong>{{ m.name }}</strong>
            <span>{{ m.email }} · {{ m.role }}</span>
          </div>
          <span class="tr-status" :class="m.status">
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

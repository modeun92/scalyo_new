<template>
  <section class="manager_section">
    <h2>💚 {{ t('mgr_wellbeing') }}</h2>
    <div class="wellbeing_grid">
      <div v-for="m in members" :key="m.id" class="member_card">
        <div class="masterclass_header">
          <div class="masterclass_avatar" :class="statusClass(m)">{{ m.name[0] }}</div>
          <div class="masterclass_info">
            <strong>{{ m.name }}</strong>
            <span class="masterclass_role">{{ m.role }}</span>
          </div>
          <span class="masterclass_status_badge" :class="statusClass(m)">
            {{ statusText(m) }}
          </span>
        </div>

        <!-- Wellbeing bar (B-09: '—' without data, never an invented figure) -->
        <div class="masterclass_metric">
          <div class="metric_row">
            <span class="metric_label">{{ t('mgr_wellbeing') }}</span>
            <span class="metric_value" :class="wellbeingClass(m.wellbeingScore)">
              {{ typeof m.wellbeingScore === 'number' ? m.wellbeingScore + '/100' : '—' }}
            </span>
          </div>
          <div class="metric_bar">
            <div
              class="metric_fill"
              :class="wellbeingClass(m.wellbeingScore)"
              :style="{ width: (typeof m.wellbeingScore === 'number' ? m.wellbeingScore : 0) + '%' }"
            />
          </div>
        </div>

        <!-- Workload bar -->
        <div class="masterclass_metric">
          <div class="metric_row">
            <span class="metric_label">{{ t('mgr_workload') }}</span>
            <span class="metric_value" :class="workloadClass(m.workload)">
              {{ typeof m.workload === 'number' ? m.workload + '%' : '—' }}
            </span>
          </div>
          <div class="metric_bar">
            <div
              class="metric_fill"
              :class="workloadClass(m.workload)"
              :style="{ width: (typeof m.workload === 'number' ? m.workload : 0) + '%' }"
            />
          </div>
        </div>

        <!-- Burnout -->
        <!-- B-16 (settled in Lot 3a): the "mood of the week" block read
             m.weekMoods, a field that does NOT EXIST on the team store → never rendered. Removed
             without a replacement: individual mood is self-only (Oxygen);
             the team aggregate = Lot 4 (SECURITY DEFINER, n ≥ 5). -->
        <div class="masterclass_row">
          <span class="metric_label">{{ t('mgr_burnout_risk') }}</span>
          <span class="burnout_badge" :class="m.burnoutRisk || ''">
            {{ m.burnoutRisk ? t('mgr_burnout_' + m.burnoutRisk) : '—' }}
          </span>
        </div>
      </div>
    </div>
  </section>
</template>

<script setup>
import { useI18n } from 'vue-i18n'
import { wellbeingClass, workloadClass } from './managerHelpers.js'

const { t } = useI18n({ useScope: 'global' })

defineProps({
  members: { type: Array, required: true }
})

// B-09: status derived from an honest statusLabel (null = no data → neutral)
function statusClass(m) { return m.statusLabel === 'overloaded' ? 'overloaded' : m.statusLabel ? 'healthy' : '' }
function statusText(m) { if (!m.statusLabel) return '—'; return m.statusLabel === 'overloaded' ? t('kpi_overloaded') : t('status_healthy') }
</script>

<template>
  <!-- Dashboard Overview -->
  <div v-if="activeDemo === 0" key="dash" class="mock-panel">
    <div class="mock-header">
      <h3>{{ t('demo_overview') }}</h3>
      <span class="mock-date">{{ t('demo_today') }}</span>
    </div>
    <div class="mock-kpi-row">
      <div class="mock-kpi"><span class="kpi-value purple">{{ t('mock_arr_total') }}</span><span class="kpi-label">{{ t('demo_arr') }}</span></div>
      <div class="mock-kpi"><span class="kpi-value green">8.2</span><span class="kpi-label">{{ t('demo_avg_health') }}</span></div>
      <div class="mock-kpi"><span class="kpi-value red">3</span><span class="kpi-label">{{ t('demo_critical') }}</span></div>
      <div class="mock-kpi"><span class="kpi-value blue">{{ t('demo_roadmap_val') }}</span><span class="kpi-label">{{ t('demo_roadmap') }}</span></div>
    </div>
    <div class="mock-ai-box">
      <span class="ai-label">{{ t('demo_ai_insights') }}</span>
      <p>{{ t('demo_ai_msg') }}</p>
    </div>
    <div class="chart-bars">
      <div v-for="(h, i) in [65,72,68,78,85,92]" :key="i" class="chart-bar" :style="{ height: h + '%' }">
        <span class="bar-val">{{ 100 + i * 2 }}%</span>
      </div>
    </div>
  </div>

  <!-- Portfolio -->
  <div v-else-if="activeDemo === 1" key="port" class="mock-panel">
    <div class="mock-header">
      <h3>{{ t('d_m1_head') }}</h3>
      <span class="mock-badge warn">{{ t('d_m1_alerts') }}</span>
    </div>
    <div class="mock-accounts">
      <div class="mock-acc" v-for="acc in mockAccounts" :key="acc.name">
        <div class="acc-avatar" :style="{ background: acc.color }">{{ acc.name[0] }}</div>
        <div class="acc-info">
          <strong>{{ acc.name }}</strong>
          <div class="health-bar"><div :style="{ width: acc.health * 10 + '%', background: acc.health > 7 ? '#10b981' : acc.health > 4 ? '#f59e0b' : '#ef4444' }" /></div>
        </div>
        <span class="acc-score" :style="{ color: acc.health > 7 ? '#10b981' : acc.health > 4 ? '#f59e0b' : '#ef4444' }">{{ acc.health.toFixed(1) }}</span>
      </div>
    </div>
  </div>

  <!-- Coach IA -->
  <div v-else-if="activeDemo === 2" key="coach" class="mock-panel">
    <div class="mock-header">
      <h3>{{ t('d_m2_head') }}</h3>
      <span class="mock-badge green">{{ t('d_m2_badge') }}</span>
    </div>
    <div class="mock-chat">
      <div class="chat-msg user"><span>{{ t('d_m2_q') }}</span></div>
      <div class="chat-msg bot"><span>{{ t('d_m2_a') }}</span></div>
    </div>
    <div class="mock-ai-box">
      <span class="ai-label">{{ t('d_m2_sug') }}</span>
      <p>{{ t('d_m2_sug_txt') }}</p>
    </div>
  </div>

  <!-- Wellbeing -->
  <div v-else-if="activeDemo === 3" key="well" class="mock-panel">
    <div class="mock-header">
      <h3>{{ t('d_m3_head') }}</h3>
      <span class="mock-badge warn">{{ t('d_m3_badge') }}</span>
    </div>
    <div class="mock-kpi-row">
      <div class="mock-kpi"><span class="kpi-value green">7.4</span><span class="kpi-label">{{ t('d_m3_avg') }}</span></div>
      <div class="mock-kpi"><span class="kpi-value amber">6.8</span><span class="kpi-label">{{ t('d_m3_load') }}</span></div>
      <div class="mock-kpi"><span class="kpi-value red">1</span><span class="kpi-label">{{ t('d_m3_alrt') }}</span></div>
    </div>
    <div class="mock-ai-box warn">
      <span class="ai-label">{{ t('d_m3_burn') }}</span>
      <p>{{ t('d_m3_sara') }}</p>
    </div>
    <div class="mock-trend">{{ t('d_m3_trnd') }}</div>
  </div>

  <!-- Email Studio -->
  <div v-else-if="activeDemo === 4" key="email" class="mock-panel">
    <div class="mock-header">
      <h3>{{ t('demo_email_head') }}</h3>
      <div class="email-tags">
        <span class="etag">{{ t('demo_tag_checkin') }}</span>
        <span class="etag">{{ t('demo_tag_churn') }}</span>
      </div>
    </div>
    <div class="mock-email">
      <div class="email-field"><strong>{{ t('demo_email_to') }}</strong> marc.duval@client.com</div>
      <div class="email-field"><strong>{{ t('d_m5_lbl') }}</strong> {{ t('d_m5_subj') }}</div>
      <div class="email-body" v-html="t('d_m5_body')"></div>
      <div class="email-footer-badge">{{ t('demo_ai_badge') }}</div>
    </div>
  </div>

  <!-- Planning -->
  <div v-else-if="activeDemo === 5" key="plan" class="mock-panel">
    <div class="mock-header">
      <h3>{{ t('d_m6_head') }}</h3>
      <span class="mock-badge">{{ t('d_m6_ev') }}</span>
    </div>
    <div class="mock-calendar">
      <div class="cal-grid">
        <div v-for="d in 28" :key="d" class="cal-day" :class="{ today: d === 12, event: [3,7,12,15,21,25].includes(d) }">
          {{ d }}
          <span v-if="[3,7,12,15,21,25].includes(d)" class="cal-dot" />
        </div>
      </div>
      <div class="cal-event-preview">
        <span class="cal-ev-icon">&#128222;</span>
        {{ t('d_m6_ret') }} &mdash; Leroy Finance
      </div>
    </div>
  </div>

  <!-- Task Board -->
  <div v-else-if="activeDemo === 6" key="tasks" class="mock-panel">
    <div class="mock-header">
      <h3>{{ t('demo_tb_head') }}</h3>
      <span class="mock-badge warn">{{ t('demo_tb_late') }}</span>
    </div>
    <div class="mock-kanban mock-kanban-4">
      <div class="kanban-col">
        <div class="kanban-col-title">{{ t('demo_col_1') }} <span class="col-count">2</span></div>
        <div class="kanban-card late">QBR Acme Corp <span class="card-tag">{{ t('demo_card_late') }}</span></div>
        <div class="kanban-card">Check-in TechScale</div>
      </div>
      <div class="kanban-col">
        <div class="kanban-col-title">{{ t('demo_col_2') }} <span class="col-count">2</span></div>
        <div class="kanban-card active">Playbook Leroy Finance</div>
        <div class="kanban-card">Onboarding NovaCRM</div>
      </div>
      <div class="kanban-col">
        <div class="kanban-col-title">{{ t('demo_col_3') }} <span class="col-count">1</span></div>
        <div class="kanban-card done">QBR Biotech Group</div>
      </div>
      <div class="kanban-col">
        <div class="kanban-col-title">{{ t('demo_col_4') }} <span class="col-count">1</span></div>
        <div class="kanban-card blocked">Escalation DataVault <span class="card-tag red">{{ t('demo_card_blocked') }}</span></div>
      </div>
    </div>
  </div>

  <!-- Import IA -->
  <div v-else-if="activeDemo === 7" key="import" class="mock-panel">
    <div class="mock-header">
      <h3>&#129302; {{ t('demo_import') }}</h3>
      <span class="mock-badge green">{{ t('demo_import_badge') }}</span>
    </div>
    <div class="import-steps">
      <div class="imp-step done"><span class="imp-dot done">&#10003;</span><span>{{ t('demo_imp_s1') }}</span></div>
      <div class="imp-step done"><span class="imp-dot done">&#10003;</span><span>{{ t('demo_imp_s2') }}</span></div>
      <div class="imp-step active"><span class="imp-dot active">3</span><span>{{ t('demo_imp_s3') }}</span></div>
      <div class="imp-step"><span class="imp-dot">4</span><span>{{ t('demo_imp_s4') }}</span></div>
    </div>
    <div class="mock-ai-box">
      <span class="ai-label">&#129302; {{ t('demo_imp_detected') }}</span>
      <p>{{ t('demo_imp_result') }}</p>
    </div>
    <div class="imp-preview-mini">
      <div class="ipm-row header"><span>{{ t('demo_imp_col1') }}</span><span>ARR</span><span>Health</span></div>
      <div class="ipm-row"><span>TechScale</span><span>{{ t('mock_arr_a1') }}</span><span class="green">9.1</span></div>
      <div class="ipm-row"><span>Acme Corp</span><span>{{ t('mock_arr_a2') }}</span><span class="amber">6.4</span></div>
    </div>
  </div>

  <!-- Resources -->
  <div v-else key="lib" class="mock-panel">
    <div class="mock-header">
      <h3>{{ t('demo_lib_title') }}</h3>
      <span class="mock-badge">{{ t('demo_lib_badge') }}</span>
    </div>
    <div class="mock-library">
      <div class="lib-card">
        <span class="lib-icon">&#128213;</span>
        <div><strong>{{ t('demo_guide1') }}</strong><br /><small>{{ t('demo_pdf1') }}</small></div>
      </div>
      <div class="lib-card">
        <span class="lib-icon">&#128222;</span>
        <div><strong>{{ t('demo_script1') }}</strong><br /><small>{{ t('demo_pdf1') }}</small></div>
      </div>
      <div class="lib-card new">
        <span class="lib-icon">&#127381;</span>
        <div><strong>{{ t('demo_pb_new') }}</strong><br /><small>{{ t('demo_pb_sub') }}</small></div>
      </div>
    </div>
  </div>
</template>

<script setup>
defineProps({
  activeDemo:   { type: Number, default: 0 },
  mockAccounts: { type: Array, default: () => [] },
  t:            { type: Function, required: true }
})
</script>

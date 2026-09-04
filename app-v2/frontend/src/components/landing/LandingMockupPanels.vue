<template>
  <!-- Dashboard Overview -->
  <div v-if="activeDemo === 0" key="dash" class="mockup_panel">
    <div class="landing_mockup_header">
      <h3>{{ t('demo_overview') }}</h3>
      <span class="mockup_date">{{ t('demo_today') }}</span>
    </div>
    <div class="mockup_kpi_row">
      <div class="mockup_kpi"><span class="kpi_value purple">{{ t('mock_arr_total') }}</span><span class="kpi_label">{{ t('demo_arr') }}</span></div>
      <div class="mockup_kpi"><span class="kpi_value green">8.2</span><span class="kpi_label">{{ t('demo_avg_health') }}</span></div>
      <div class="mockup_kpi"><span class="kpi_value red">3</span><span class="kpi_label">{{ t('demo_critical') }}</span></div>
      <div class="mockup_kpi"><span class="kpi_value blue">{{ t('demo_roadmap_val') }}</span><span class="kpi_label">{{ t('demo_roadmap') }}</span></div>
    </div>
    <div class="mockup_ai_box">
      <span class="ai_label">{{ t('demo_ai_insights') }}</span>
      <p>{{ t('demo_ai_msg') }}</p>
    </div>
    <div class="chart_bars">
      <div v-for="(h, i) in [65,72,68,78,85,92]" :key="i" class="chart_bar" :style="{ height: h + '%' }">
        <span class="bar_value">{{ 100 + i * 2 }}%</span>
      </div>
    </div>
  </div>

  <!-- Portfolio -->
  <div v-else-if="activeDemo === 1" key="port" class="mockup_panel">
    <div class="landing_mockup_header">
      <h3>{{ t('d_m1_head') }}</h3>
      <span class="mockup_badge warn">{{ t('d_m1_alerts') }}</span>
    </div>
    <div class="mockup_accounts">
      <div class="mockup_acc" v-for="acc in mockAccounts" :key="acc.name">
        <div class="account_avatar" :style="{ background: acc.color }">{{ acc.name[0] }}</div>
        <div class="account_info">
          <strong>{{ acc.name }}</strong>
          <div class="health_bar"><div :style="{ width: acc.health * 10 + '%', background: acc.health > 7 ? '#10b981' : acc.health > 4 ? '#f59e0b' : '#ef4444' }" /></div>
        </div>
        <span class="account_score" :style="{ color: acc.health > 7 ? '#10b981' : acc.health > 4 ? '#f59e0b' : '#ef4444' }">{{ acc.health.toFixed(1) }}</span>
      </div>
    </div>
  </div>

  <!-- Coach IA -->
  <div v-else-if="activeDemo === 2" key="coach" class="mockup_panel">
    <div class="landing_mockup_header">
      <h3>{{ t('d_m2_head') }}</h3>
      <span class="mockup_badge green">{{ t('d_m2_badge') }}</span>
    </div>
    <div class="mockup_chat">
      <div class="chat_message user"><span>{{ t('d_m2_q') }}</span></div>
      <div class="chat_message bot"><span>{{ t('d_m2_a') }}</span></div>
    </div>
    <div class="mockup_ai_box">
      <span class="ai_label">{{ t('d_m2_sug') }}</span>
      <p>{{ t('d_m2_sug_txt') }}</p>
    </div>
  </div>

  <!-- Wellbeing -->
  <div v-else-if="activeDemo === 3" key="well" class="mockup_panel">
    <div class="landing_mockup_header">
      <h3>{{ t('d_m3_head') }}</h3>
      <span class="mockup_badge warn">{{ t('d_m3_badge') }}</span>
    </div>
    <div class="mockup_kpi_row">
      <div class="mockup_kpi"><span class="kpi_value green">7.4</span><span class="kpi_label">{{ t('d_m3_avg') }}</span></div>
      <div class="mockup_kpi"><span class="kpi_value amber">6.8</span><span class="kpi_label">{{ t('d_m3_load') }}</span></div>
      <div class="mockup_kpi"><span class="kpi_value red">1</span><span class="kpi_label">{{ t('d_m3_alrt') }}</span></div>
    </div>
    <div class="mockup_ai_box warn">
      <span class="ai_label">{{ t('d_m3_burn') }}</span>
      <p>{{ t('d_m3_sara') }}</p>
    </div>
    <div class="mockup_trend">{{ t('d_m3_trnd') }}</div>
  </div>

  <!-- Email Studio -->
  <div v-else-if="activeDemo === 4" key="email" class="mockup_panel">
    <div class="landing_mockup_header">
      <h3>{{ t('demo_email_head') }}</h3>
      <div class="email_tags">
        <span class="etag">{{ t('demo_tag_checkin') }}</span>
        <span class="etag">{{ t('demo_tag_churn') }}</span>
      </div>
    </div>
    <div class="mockup_email">
      <div class="email_field"><strong>{{ t('demo_email_to') }}</strong> marc.duval@client.com</div>
      <div class="email_field"><strong>{{ t('d_m5_lbl') }}</strong> {{ t('d_m5_subj') }}</div>
      <div class="email_body" v-html="t('d_m5_body')"></div>
      <div class="email_footer_badge">{{ t('demo_ai_badge') }}</div>
    </div>
  </div>

  <!-- Planning -->
  <div v-else-if="activeDemo === 5" key="plan" class="mockup_panel">
    <div class="landing_mockup_header">
      <h3>{{ t('d_m6_head') }}</h3>
      <span class="mockup_badge">{{ t('d_m6_ev') }}</span>
    </div>
    <div class="mockup_calendar">
      <div class="calendar_grid">
        <div v-for="d in 28" :key="d" class="calendar_day" :class="{ today: d === 12, event: [3,7,12,15,21,25].includes(d) }">
          {{ d }}
          <span v-if="[3,7,12,15,21,25].includes(d)" class="calendar_dot" />
        </div>
      </div>
      <div class="calendar_event_preview">
        <span class="calendar_ev_icon">&#128222;</span>
        {{ t('d_m6_ret') }} &mdash; Leroy Finance
      </div>
    </div>
  </div>

  <!-- Task Board -->
  <div v-else-if="activeDemo === 6" key="tasks" class="mockup_panel">
    <div class="landing_mockup_header">
      <h3>{{ t('demo_tb_head') }}</h3>
      <span class="mockup_badge warn">{{ t('demo_tb_late') }}</span>
    </div>
    <div class="mockup_kanban mockup_kanban_4">
      <div class="kanban_column">
        <div class="kanban_column_title">{{ t('demo_col_1') }} <span class="column_count">2</span></div>
        <div class="kanban_card late">QBR Acme Corp <span class="card_tag">{{ t('demo_card_late') }}</span></div>
        <div class="kanban_card">Check-in TechScale</div>
      </div>
      <div class="kanban_column">
        <div class="kanban_column_title">{{ t('demo_col_2') }} <span class="column_count">2</span></div>
        <div class="kanban_card active">Playbook Leroy Finance</div>
        <div class="kanban_card">Onboarding NovaCRM</div>
      </div>
      <div class="kanban_column">
        <div class="kanban_column_title">{{ t('demo_col_3') }} <span class="column_count">1</span></div>
        <div class="kanban_card done">QBR Biotech Group</div>
      </div>
      <div class="kanban_column">
        <div class="kanban_column_title">{{ t('demo_col_4') }} <span class="column_count">1</span></div>
        <div class="kanban_card blocked">Escalation DataVault <span class="card_tag red">{{ t('demo_card_blocked') }}</span></div>
      </div>
    </div>
  </div>

  <!-- Import IA -->
  <div v-else-if="activeDemo === 7" key="import" class="mockup_panel">
    <div class="landing_mockup_header">
      <h3>&#129302; {{ t('demo_import') }}</h3>
      <span class="mockup_badge green">{{ t('demo_import_badge') }}</span>
    </div>
    <div class="landing_import_steps">
      <div class="import_step done"><span class="import_dot done">&#10003;</span><span>{{ t('demo_imp_s1') }}</span></div>
      <div class="import_step done"><span class="import_dot done">&#10003;</span><span>{{ t('demo_imp_s2') }}</span></div>
      <div class="import_step active"><span class="import_dot active">3</span><span>{{ t('demo_imp_s3') }}</span></div>
      <div class="import_step"><span class="import_dot">4</span><span>{{ t('demo_imp_s4') }}</span></div>
    </div>
    <div class="mockup_ai_box">
      <span class="ai_label">&#129302; {{ t('demo_imp_detected') }}</span>
      <p>{{ t('demo_imp_result') }}</p>
    </div>
    <div class="import_preview_mini">
      <div class="ipm_row header"><span>{{ t('demo_imp_col1') }}</span><span>ARR</span><span>Health</span></div>
      <div class="ipm_row"><span>TechScale</span><span>{{ t('mock_arr_a1') }}</span><span class="green">9.1</span></div>
      <div class="ipm_row"><span>Acme Corp</span><span>{{ t('mock_arr_a2') }}</span><span class="amber">6.4</span></div>
    </div>
  </div>

  <!-- Resources -->
  <div v-else key="lib" class="mockup_panel">
    <div class="landing_mockup_header">
      <h3>{{ t('demo_lib_title') }}</h3>
      <span class="mockup_badge">{{ t('demo_lib_badge') }}</span>
    </div>
    <div class="mockup_library">
      <div class="library_card">
        <span class="library_icon">&#128213;</span>
        <div><strong>{{ t('demo_guide1') }}</strong><br /><small>{{ t('demo_pdf1') }}</small></div>
      </div>
      <div class="library_card">
        <span class="library_icon">&#128222;</span>
        <div><strong>{{ t('demo_script1') }}</strong><br /><small>{{ t('demo_pdf1') }}</small></div>
      </div>
      <div class="library_card new">
        <span class="library_icon">&#127381;</span>
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

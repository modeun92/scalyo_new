<template>
  <section id="features" class="features_section">
    <div class="container">
      <div class="section_header anim_section" data-anim="fade-up">
        <span class="section_tag">{{ t('fl_chips_label') }}</span>
      </div>

      <!-- Module chips -->
      <div class="module_chips anim_section" data-anim="fade-up">
        <button
          v-for="(m, i) in modulesData"
          :key="i"
          class="module_chip"
          :class="{ active: activeModule === i }"
          @click="$emit('module-change', i)"
        >
          <span class="chip_icon">{{ m.icon }}</span>
          {{ m.chip }}
        </button>
      </div>

      <!-- Active module detail -->
      <transition name="module_fade" mode="out-in">
        <div class="module_detail anim_section" :key="activeModule" data-anim="fade-up">
          <div class="module_text">
            <span class="module_tag">{{ modulesData[activeModule].tag }}</span>
            <h2 class="module_title" v-html="modulesData[activeModule].h2"></h2>
            <p class="module_body">{{ modulesData[activeModule].body }}</p>
            <ul class="module_points">
              <li v-for="(p, j) in modulesData[activeModule].points" :key="j">
                <span class="point_check">&#10003;</span> {{ p }}
              </li>
            </ul>
            <a :href="appUrl + '/login'" class="button_primary module_cta">{{ modulesData[activeModule].btn }}</a>
          </div>
          <div class="module_visual">
            <div class="module_mockup_card">
              <component :is="'div'" class="mockup_content">
                <!-- Portfolio -->
                <template v-if="activeModule === 0">
                  <div class="mockup_header">{{ t('pb_title') }} <span class="mockup_mobile_badge">{{ t('pb_status') }}</span></div>
                  <div class="playbook_step done"><span>&#9989;</span> {{ t('pb_s1') }}</div>
                  <div class="playbook_step done"><span>&#9989;</span> {{ t('pb_s2') }}</div>
                  <div class="playbook_step"><span>&#11036;</span> {{ t('pb_s3') }}</div>
                  <div class="playbook_step"><span>&#11036;</span> {{ t('pb_s4') }}</div>
                  <div class="mockup_ai"><span>&#129302;</span> {{ t('pb_ai_msg') }}</div>
                </template>
                <!-- KPIs COPIL -->
                <template v-else-if="activeModule === 1">
                  <div class="mockup_header">{{ t('demo_copil_period') }} <span class="mockup_mobile_badge green">{{ t('demo_copil_badge') }}</span></div>
                  <div class="copil_kpis">
                    <div class="copil_kpi"><strong>NRR</strong><span class="green">108%</span><small>{{ t('demo_copil_up') }}</small></div>
                    <div class="copil_kpi"><strong>Churn</strong><span class="red">4.2%</span><small>{{ t('demo_copil_dn') }}</small></div>
                    <div class="copil_kpi"><strong>CSAT</strong><span class="green">4.6/5</span><small>{{ t('demo_copil_stbl') }}</small></div>
                  </div>
                </template>
                <!-- Wellbeing -->
                <template v-else-if="activeModule === 2">
                  <div class="mockup_header">{{ t('d_m3_head') }} <span class="mockup_mobile_badge warn">{{ t('d_m3_badge') }}</span></div>
                  <div class="copil_kpis">
                    <div class="copil_kpi"><strong>{{ t('d_m3_avg') }}</strong><span class="green">7.4</span></div>
                    <div class="copil_kpi"><strong>{{ t('d_m3_load') }}</strong><span class="amber">6.8</span></div>
                  </div>
                  <div class="mockup_ai"><span>&#128161;</span> {{ t('d_m3_sara') }}</div>
                </template>
                <!-- Coach IA -->
                <template v-else-if="activeModule === 3">
                  <div class="mockup_header">{{ t('demo_coach_head') }} <span class="online_dot">{{ t('coach_online') }}</span></div>
                  <div class="mini_chat">
                    <div class="masterclass_user">{{ t('coach_user') }}</div>
                    <div class="masterclass_ai">&#129302; {{ t('coach_ai') }}</div>
                  </div>
                </template>
                <!-- Email Studio -->
                <template v-else-if="activeModule === 4">
                  <div class="mockup_header">{{ t('demo_email_head') }} <span class="mockup_mobile_badge">{{ t('demo_ai_badge') }}</span></div>
                  <div class="email_tags_mini">
                    <span>{{ t('demo_tag_checkin') }}</span>
                    <span>{{ t('demo_tag_churn') }}</span>
                  </div>
                  <div class="mini_email_body">{{ t('d_m5_subj') }}</div>
                </template>
                <!-- Planning -->
                <template v-else-if="activeModule === 5">
                  <div class="mockup_header">{{ t('d_m6_head') }} <span class="mockup_mobile_badge">{{ t('d_m6_ev') }}</span></div>
                  <div class="mini_calendar">
                    <div v-for="d in 7" :key="d" class="mini_cal_day" :class="{ event: d === 3 }">{{ d + 11 }}</div>
                  </div>
                </template>
                <!-- Task Board -->
                <template v-else-if="activeModule === 6">
                  <div class="mockup_header">{{ t('demo_tb_head') }} <span class="mockup_mobile_badge warn">{{ t('demo_tb_late') }}</span></div>
                  <div class="mini_kanban">
                    <div class="mk_column"><div class="mk_card late">QBR</div></div>
                    <div class="mk_column"><div class="mk_card active">Playbook</div></div>
                    <div class="mk_column"><div class="mk_card done">QBR</div></div>
                  </div>
                </template>
                <!-- Resources -->
                <template v-else>
                  <div class="mockup_header">{{ t('demo_lib_title') }} <span class="mockup_mobile_badge">{{ t('demo_lib_badge') }}</span></div>
                  <div class="mini_lib">
                    <div class="mockup_library_item">&#128213; {{ t('demo_guide1') }}</div>
                    <div class="mockup_library_item">&#128222; {{ t('demo_script1') }}</div>
                    <div class="mockup_library_item new">&#127381; {{ t('demo_pb_new') }}</div>
                  </div>
                </template>
              </component>
            </div>
          </div>
        </div>
      </transition>
    </div>
  </section>
</template>

<script setup>
defineProps({
  modulesData:  { type: Array, required: true },
  activeModule: { type: Number, default: 0 },
  appUrl:       { type: String, default: '' },
  t:            { type: Function, required: true }
})

defineEmits(['module-change'])
</script>

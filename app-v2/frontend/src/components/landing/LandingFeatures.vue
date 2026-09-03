<template>
  <section id="features" class="features-section">
    <div class="container">
      <div class="section-header anim-section" data-anim="fade-up">
        <span class="section-tag">{{ t('fl_chips_label') }}</span>
      </div>

      <!-- Module chips -->
      <div class="module-chips anim-section" data-anim="fade-up">
        <button
          v-for="(m, i) in modulesData"
          :key="i"
          class="module-chip"
          :class="{ active: activeModule === i }"
          @click="$emit('module-change', i)"
        >
          <span class="chip-icon">{{ m.icon }}</span>
          {{ m.chip }}
        </button>
      </div>

      <!-- Active module detail -->
      <transition name="module-fade" mode="out-in">
        <div class="module-detail anim-section" :key="activeModule" data-anim="fade-up">
          <div class="module-text">
            <span class="module-tag">{{ modulesData[activeModule].tag }}</span>
            <h2 class="module-title" v-html="modulesData[activeModule].h2"></h2>
            <p class="module-body">{{ modulesData[activeModule].body }}</p>
            <ul class="module-points">
              <li v-for="(p, j) in modulesData[activeModule].points" :key="j">
                <span class="point-check">&#10003;</span> {{ p }}
              </li>
            </ul>
            <a :href="appUrl + '/login'" class="btn-primary module-cta">{{ modulesData[activeModule].btn }}</a>
          </div>
          <div class="module-visual">
            <div class="module-mockup-card">
              <component :is="'div'" class="mmock-content">
                <!-- Portfolio -->
                <template v-if="activeModule === 0">
                  <div class="mmock-head">{{ t('pb_title') }} <span class="mmock-badge">{{ t('pb_status') }}</span></div>
                  <div class="pb-step done"><span>&#9989;</span> {{ t('pb_s1') }}</div>
                  <div class="pb-step done"><span>&#9989;</span> {{ t('pb_s2') }}</div>
                  <div class="pb-step"><span>&#11036;</span> {{ t('pb_s3') }}</div>
                  <div class="pb-step"><span>&#11036;</span> {{ t('pb_s4') }}</div>
                  <div class="mmock-ai"><span>&#129302;</span> {{ t('pb_ai_msg') }}</div>
                </template>
                <!-- KPIs COPIL -->
                <template v-else-if="activeModule === 1">
                  <div class="mmock-head">{{ t('demo_copil_period') }} <span class="mmock-badge green">{{ t('demo_copil_badge') }}</span></div>
                  <div class="copil-kpis">
                    <div class="copil-kpi"><strong>NRR</strong><span class="green">108%</span><small>{{ t('demo_copil_up') }}</small></div>
                    <div class="copil-kpi"><strong>Churn</strong><span class="red">4.2%</span><small>{{ t('demo_copil_dn') }}</small></div>
                    <div class="copil-kpi"><strong>CSAT</strong><span class="green">4.6/5</span><small>{{ t('demo_copil_stbl') }}</small></div>
                  </div>
                </template>
                <!-- Wellbeing -->
                <template v-else-if="activeModule === 2">
                  <div class="mmock-head">{{ t('d_m3_head') }} <span class="mmock-badge warn">{{ t('d_m3_badge') }}</span></div>
                  <div class="copil-kpis">
                    <div class="copil-kpi"><strong>{{ t('d_m3_avg') }}</strong><span class="green">7.4</span></div>
                    <div class="copil-kpi"><strong>{{ t('d_m3_load') }}</strong><span class="amber">6.8</span></div>
                  </div>
                  <div class="mmock-ai"><span>&#128161;</span> {{ t('d_m3_sara') }}</div>
                </template>
                <!-- Coach IA -->
                <template v-else-if="activeModule === 3">
                  <div class="mmock-head">{{ t('demo_coach_head') }} <span class="online-dot">{{ t('coach_online') }}</span></div>
                  <div class="mini-chat">
                    <div class="mc-user">{{ t('coach_user') }}</div>
                    <div class="mc-ai">&#129302; {{ t('coach_ai') }}</div>
                  </div>
                </template>
                <!-- Email Studio -->
                <template v-else-if="activeModule === 4">
                  <div class="mmock-head">{{ t('demo_email_head') }} <span class="mmock-badge">{{ t('demo_ai_badge') }}</span></div>
                  <div class="email-tags-mini">
                    <span>{{ t('demo_tag_checkin') }}</span>
                    <span>{{ t('demo_tag_churn') }}</span>
                  </div>
                  <div class="mini-email-body">{{ t('d_m5_subj') }}</div>
                </template>
                <!-- Planning -->
                <template v-else-if="activeModule === 5">
                  <div class="mmock-head">{{ t('d_m6_head') }} <span class="mmock-badge">{{ t('d_m6_ev') }}</span></div>
                  <div class="mini-calendar">
                    <div v-for="d in 7" :key="d" class="mini-cal-day" :class="{ event: d === 3 }">{{ d + 11 }}</div>
                  </div>
                </template>
                <!-- Task Board -->
                <template v-else-if="activeModule === 6">
                  <div class="mmock-head">{{ t('demo_tb_head') }} <span class="mmock-badge warn">{{ t('demo_tb_late') }}</span></div>
                  <div class="mini-kanban">
                    <div class="mk-col"><div class="mk-card late">QBR</div></div>
                    <div class="mk-col"><div class="mk-card active">Playbook</div></div>
                    <div class="mk-col"><div class="mk-card done">QBR</div></div>
                  </div>
                </template>
                <!-- Resources -->
                <template v-else>
                  <div class="mmock-head">{{ t('demo_lib_title') }} <span class="mmock-badge">{{ t('demo_lib_badge') }}</span></div>
                  <div class="mini-lib">
                    <div class="ml-item">&#128213; {{ t('demo_guide1') }}</div>
                    <div class="ml-item">&#128222; {{ t('demo_script1') }}</div>
                    <div class="ml-item new">&#127381; {{ t('demo_pb_new') }}</div>
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

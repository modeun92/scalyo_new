<template>
  <div class="gv">
    <div class="guides_view_header">
      <h1>📖 {{ t('nav.guides') }}</h1>
      <p>{{ t('nav.guidesSub') }}</p>
    </div>

    <div class="guides_view_tabs">
      <button v-for="cat in categories" :key="cat.key"
              class="guides_view_tab" :class="{ active: activeTab === cat.key }"
              @click="activeTab = cat.key">
        {{ cat.icon }} {{ cat.label }}
      </button>
    </div>

    <div class="guides_view_list">
      <div v-for="process in filteredProcesses" :key="process.id"
           class="guides_view_card" :class="{ open: openId === process.id }">

        <div class="guides_view_card_header" @click="openId = openId === process.id ? null : process.id">
          <div class="guides_view_card_left">
            <span class="guides_view_icon">{{ process.icon }}</span>
            <div>
              <strong>{{ t(process.titleKey) }}</strong>
              <p>{{ t(process.descKey) }}</p>
              <div class="guides_view_meta">
                <span class="guides_view_steps_count">{{ process.steps.length }} {{ t('gv_steps_label') }}</span>
                <span class="guides_view_time">⏱ {{ process.duration }}</span>
                <span class="guides_view_level" :class="process.level">{{ t(process.levelKey) }}</span>
              </div>
            </div>
          </div>
          <span class="guides_view_chevron">{{ openId === process.id ? '▾' : '▸' }}</span>
        </div>

        <div v-if="openId === process.id" class="guides_view_steps">
          <div v-for="(step, i) in process.steps" :key="i" class="guides_view_step">
            <div class="guides_view_step_number">{{ i + 1 }}</div>
            <div class="guides_view_step_body">
              <strong>{{ t(step.titleKey) }}</strong>
              <p>{{ t(step.descKey) }}</p>
              <div v-if="step.tipKeys && step.tipKeys.length" class="guides_view_step_tips">
                <span v-for="tipKey in step.tipKeys" :key="tipKey" class="guides_view_tip">💡 {{ t(tipKey) }}</span>
              </div>
              <div v-if="step.warnKey" class="guides_view_step_warning">⚠️ {{ t(step.warnKey) }}</div>
            </div>
          </div>
          <div v-if="process.outcomeKey" class="guides_view_outcome">
            <span>🎯 {{ t('gv_outcome_label') }}</span> {{ t(process.outcomeKey) }}
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { useI18n } from 'vue-i18n'

const { t } = useI18n({ useScope: 'global' })

const activeTab = ref('all')
const openId = ref(null)

const categories = computed(() => [
  { key: 'all', icon: '🗂', label: t('gv_cat_all') },
  { key: 'client', icon: '👤', label: t('gv_cat_client') },
  { key: 'crisis', icon: '🚨', label: t('gv_cat_crisis') },
  { key: 'growth', icon: '📈', label: t('gv_cat_growth') },
  { key: 'organization', icon: '📅', label: t('gv_cat_organization') },
])

const processes = [
  {
    id: 'p1', category: 'client', icon: '🚀', duration: '10 min', level: 'beginner',
    titleKey: 'gv_p1_title', descKey: 'gv_p1_desc', outcomeKey: 'gv_p1_outcome',
    levelKey: 'gv_level_beginner',
    steps: [
      { titleKey: 'gv_p1_s1_title', descKey: 'gv_p1_s1_desc', tipKeys: ['gv_p1_s1_tip1', 'gv_p1_s1_tip2'], warnKey: 'gv_p1_s1_warn' },
      { titleKey: 'gv_p1_s2_title', descKey: 'gv_p1_s2_desc', tipKeys: ['gv_p1_s2_tip1', 'gv_p1_s2_tip2'] },
      { titleKey: 'gv_p1_s3_title', descKey: 'gv_p1_s3_desc', tipKeys: ['gv_p1_s3_tip1'], warnKey: 'gv_p1_s3_warn' },
      { titleKey: 'gv_p1_s4_title', descKey: 'gv_p1_s4_desc', tipKeys: ['gv_p1_s4_tip1'] },
      { titleKey: 'gv_p1_s5_title', descKey: 'gv_p1_s5_desc', tipKeys: ['gv_p1_s5_tip1'] },
      { titleKey: 'gv_p1_s6_title', descKey: 'gv_p1_s6_desc', tipKeys: ['gv_p1_s6_tip1', 'gv_p1_s6_tip2'] },
    ]
  },
  {
    id: 'p2', category: 'crisis', icon: '🚨', duration: '15 min', level: 'expert',
    titleKey: 'gv_p2_title', descKey: 'gv_p2_desc', outcomeKey: 'gv_p2_outcome',
    levelKey: 'gv_level_expert',
    steps: [
      { titleKey: 'gv_p2_s1_title', descKey: 'gv_p2_s1_desc', warnKey: 'gv_p2_s1_warn' },
      { titleKey: 'gv_p2_s2_title', descKey: 'gv_p2_s2_desc', tipKeys: ['gv_p2_s2_tip1'] },
      { titleKey: 'gv_p2_s3_title', descKey: 'gv_p2_s3_desc', tipKeys: ['gv_p2_s3_tip1'], warnKey: 'gv_p2_s3_warn' },
      { titleKey: 'gv_p2_s4_title', descKey: 'gv_p2_s4_desc', tipKeys: ['gv_p2_s4_tip1'] },
      { titleKey: 'gv_p2_s5_title', descKey: 'gv_p2_s5_desc', warnKey: 'gv_p2_s5_warn' },
      { titleKey: 'gv_p2_s6_title', descKey: 'gv_p2_s6_desc', tipKeys: ['gv_p2_s6_tip1'] },
      { titleKey: 'gv_p2_s7_title', descKey: 'gv_p2_s7_desc', tipKeys: ['gv_p2_s7_tip1', 'gv_p2_s7_tip2'] },
    ]
  },
  {
    id: 'p3', category: 'client', icon: '🔄', duration: '8 min', level: 'intermediate',
    titleKey: 'gv_p3_title', descKey: 'gv_p3_desc', outcomeKey: 'gv_p3_outcome',
    levelKey: 'gv_level_intermediate',
    steps: [
      { titleKey: 'gv_p3_s1_title', descKey: 'gv_p3_s1_desc', warnKey: 'gv_p3_s1_warn' },
      { titleKey: 'gv_p3_s2_title', descKey: 'gv_p3_s2_desc', tipKeys: ['gv_p3_s2_tip1'] },
      { titleKey: 'gv_p3_s3_title', descKey: 'gv_p3_s3_desc', tipKeys: ['gv_p3_s3_tip1'] },
      { titleKey: 'gv_p3_s4_title', descKey: 'gv_p3_s4_desc', warnKey: 'gv_p3_s4_warn' },
      { titleKey: 'gv_p3_s5_title', descKey: 'gv_p3_s5_desc', tipKeys: ['gv_p3_s5_tip1'] },
    ]
  },
  {
    id: 'p4', category: 'crisis', icon: '👤', duration: '5 min', level: 'expert',
    titleKey: 'gv_p4_title', descKey: 'gv_p4_desc', outcomeKey: 'gv_p4_outcome',
    levelKey: 'gv_level_expert',
    steps: [
      { titleKey: 'gv_p4_s1_title', descKey: 'gv_p4_s1_desc', tipKeys: ['gv_p4_s1_tip1'] },
      { titleKey: 'gv_p4_s2_title', descKey: 'gv_p4_s2_desc', warnKey: 'gv_p4_s2_warn' },
      { titleKey: 'gv_p4_s3_title', descKey: 'gv_p4_s3_desc', tipKeys: ['gv_p4_s3_tip1'] },
      { titleKey: 'gv_p4_s4_title', descKey: 'gv_p4_s4_desc', tipKeys: ['gv_p4_s4_tip1'] },
      { titleKey: 'gv_p4_s5_title', descKey: 'gv_p4_s5_desc', warnKey: 'gv_p4_s5_warn' },
    ]
  },
  {
    id: 'p5', category: 'growth', icon: '📈', duration: '8 min', level: 'intermediate',
    titleKey: 'gv_p5_title', descKey: 'gv_p5_desc', outcomeKey: 'gv_p5_outcome',
    levelKey: 'gv_level_intermediate',
    steps: [
      { titleKey: 'gv_p5_s1_title', descKey: 'gv_p5_s1_desc', warnKey: 'gv_p5_s1_warn' },
      { titleKey: 'gv_p5_s2_title', descKey: 'gv_p5_s2_desc', tipKeys: ['gv_p5_s2_tip1'] },
      { titleKey: 'gv_p5_s3_title', descKey: 'gv_p5_s3_desc', tipKeys: ['gv_p5_s3_tip1'] },
      { titleKey: 'gv_p5_s4_title', descKey: 'gv_p5_s4_desc', tipKeys: ['gv_p5_s4_tip1'] },
      { titleKey: 'gv_p5_s5_title', descKey: 'gv_p5_s5_desc', tipKeys: ['gv_p5_s5_tip1'] },
      { titleKey: 'gv_p5_s6_title', descKey: 'gv_p5_s6_desc', warnKey: 'gv_p5_s6_warn' },
    ]
  },
  {
    id: 'p6', category: 'organization', icon: '📅', duration: '5 min', level: 'beginner',
    titleKey: 'gv_p6_title', descKey: 'gv_p6_desc', outcomeKey: 'gv_p6_outcome',
    levelKey: 'gv_level_beginner',
    steps: [
      { titleKey: 'gv_p6_s1_title', descKey: 'gv_p6_s1_desc', tipKeys: ['gv_p6_s1_tip1'] },
      { titleKey: 'gv_p6_s2_title', descKey: 'gv_p6_s2_desc', tipKeys: ['gv_p6_s2_tip1'] },
      { titleKey: 'gv_p6_s3_title', descKey: 'gv_p6_s3_desc', warnKey: 'gv_p6_s3_warn' },
      { titleKey: 'gv_p6_s4_title', descKey: 'gv_p6_s4_desc', tipKeys: ['gv_p6_s4_tip1'] },
    ]
  },
]

const filteredProcesses = computed(() =>
  activeTab.value === 'all' ? processes : processes.filter(p => p.category === activeTab.value)
)
</script>

<style scoped>
.gv { max-width: 900px; }
.guides_view_header { margin-bottom: 24px; }
.guides_view_header h1 { font-size: 1.5rem; font-weight: 800; margin-bottom: 4px; }
.guides_view_header p { font-size: 0.85rem; color: var(--text-secondary); }
.guides_view_tabs { display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 24px; }
.guides_view_tab { background: var(--bg); border: none; padding: 7px 16px; border-radius: 8px; font-size: 0.78rem; font-weight: 500; color: var(--text-muted); cursor: pointer; transition: all 0.15s; }
.guides_view_tab.active { background: var(--purple-bg); color: var(--purple); font-weight: 600; }
.guides_view_tab:hover:not(.active) { background: var(--bg-hover); }
.guides_view_list { display: flex; flex-direction: column; gap: 12px; }
.guides_view_card { background: #fff; border: 1px solid var(--border); border-radius: 12px; overflow: hidden; transition: all 0.2s; }
.guides_view_card:hover { box-shadow: var(--shadow-sm); }
.guides_view_card.open { border-color: var(--purple-border); }
.guides_view_card_header { display: flex; align-items: flex-start; justify-content: space-between; padding: 20px; cursor: pointer; transition: background 0.15s; gap: 16px; }
.guides_view_card_header:hover { background: var(--bg-hover); }
.guides_view_card_left { display: flex; gap: 14px; flex: 1; min-width: 0; }
.guides_view_icon { font-size: 1.8rem; flex-shrink: 0; }
.guides_view_card_left strong { font-size: 0.95rem; font-weight: 700; display: block; margin-bottom: 4px; }
.guides_view_card_left p { font-size: 0.78rem; color: var(--text-secondary); line-height: 1.5; margin-bottom: 8px; }
.guides_view_meta { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
.guides_view_steps_count { font-size: 0.65rem; background: var(--purple-bg); color: var(--purple); padding: 2px 8px; border-radius: 4px; font-weight: 600; }
.guides_view_time { font-size: 0.65rem; color: var(--text-muted); }
.guides_view_level { font-size: 0.65rem; color: var(--text-muted); }
.guides_view_chevron { font-size: 0.85rem; color: var(--text-muted); flex-shrink: 0; margin-top: 4px; }
.guides_view_steps { border-top: 1px solid var(--border-light); padding: 20px 24px; display: flex; flex-direction: column; gap: 0; }
.guides_view_step { display: flex; gap: 16px; padding: 16px 0; border-bottom: 1px solid var(--border-light); position: relative; }
.guides_view_step:last-child { border-bottom: none; }
.guides_view_step_number { width: 32px; height: 32px; border-radius: 50%; background: var(--purple); color: #fff; font-size: 0.82rem; font-weight: 700; display: flex; align-items: center; justify-content: center; flex-shrink: 0; margin-top: 2px; }
.guides_view_step_body { flex: 1; }
.guides_view_step_body strong { font-size: 0.9rem; display: block; margin-bottom: 6px; }
.guides_view_step_body p { font-size: 0.82rem; color: var(--text-secondary); line-height: 1.65; margin-bottom: 8px; }
.guides_view_step_tips { display: flex; flex-direction: column; gap: 4px; margin-bottom: 6px; }
.guides_view_tip { font-size: 0.75rem; color: #92400e; background: #fef3c7; padding: 4px 10px; border-radius: 6px; }
.guides_view_step_warning { font-size: 0.75rem; color: #991b1b; background: #fee2e2; padding: 6px 12px; border-radius: 6px; }
.guides_view_outcome { margin-top: 12px; padding: 14px 16px; background: #d1fae5; border-radius: 8px; font-size: 0.82rem; color: #065f46; }
.guides_view_outcome span { font-weight: 700; }
@media (max-width: 768px) { .guides_view_card_left { flex-direction: column; } }
</style>
<template>
<div class="kpv">
  <!-- Couverture -->
  <div class="kpi_preview_cover" :style="{ background: coverGradient }">
    <div class="kpi_preview_cover_inner">
      <div class="kpi_preview_logo_placeholder" v-if="!copil.clientLogo">
        {{ copil.clientName?.charAt(0) || 'C' }}
      </div>
      <h1>{{ copil.title }}</h1>
      <p>{{ copil.subtitle }}</p>
      <div class="kpi_preview_cover_meta">
        <span>{{ copil.period }}</span>
        <span>{{ copil.clientName }}</span>
        <span>{{ copil.presenter }}</span>
      </div>
    </div>
  </div>

  <!-- Blocs -->
  <div class="kpi_preview_blocks">
    <div v-for="block in visibleBlocks" :key="block.id"
         class="kpi_preview_block" :class="'kpi_preview_' + block.type">
      <h3 v-if="block.title" class="kpi_preview_block_title">{{ block.title }}</h3>

      <!-- kpi_grid -->
      <div v-if="block.type === 'kpi_grid'" class="kpi_preview_kpi_grid">
        <div v-for="(kpi, i) in block.data.kpis" :key="i"
             class="kpi_preview_kpi_card" :style="{ borderTopColor: kpi.color }">
          <div class="kpi_preview_kpi_value" :style="{ color: kpi.color }">
            {{ num(kpi.value) }}<span v-if="kpi.unit" class="kpi_preview_kpi_unit">{{ kpi.unit }}</span>
          </div>
          <div class="kpi_preview_kpi_label">{{ kpi.label }}</div>
          <div class="kpi_preview_kpi_trend" v-if="kpi.trend">
            <span :class="'trend_' + kpi.trend">
              {{ kpi.trend === 'up' ? '↑' : kpi.trend === 'down' ? '↓' : '→' }}
            </span>
          </div>
        </div>
      </div>

      <!-- kpi_single -->
      <div v-else-if="block.type === 'kpi_single'" class="kpi_preview_kpi_single">
        <div class="kpi_preview_single_value" :style="{ color: block.data.color }">
          {{ num(block.data.value) }}
          <span v-if="block.data.unit" class="kpi_preview_single_unit">{{ block.data.unit }}</span>
        </div>
        <div class="kpi_preview_single_label">{{ block.data.label }}</div>
        <div class="kpi_preview_single_previous" v-if="block.data.previous">
          {{ t('copil_prev_vs') }} {{ num(block.data.previous) }} {{ block.data.unit }}
        </div>
      </div>

      <!-- chart_bar -->
      <div v-else-if="block.type === 'chart_bar'" class="kpi_preview_chart">
        <apexchart :key="'bar-' + block.id" type="bar"
          :options="barOptions(block.data, copil.color)"
          :series="barSeries(block.data)"
          height="220" />
      </div>

      <!-- chart_line -->
      <div v-else-if="block.type === 'chart_line'" class="kpi_preview_chart">
        <apexchart :key="'line-' + block.id" type="line"
          :options="lineOptions(block.data, copil.color)"
          :series="lineSeries(block.data)"
          height="220" />
      </div>

      <!-- chart_donut -->
      <div v-else-if="block.type === 'chart_donut'" class="kpi_preview_chart">
        <apexchart :key="'donut-' + block.id" type="donut"
          :options="donutOptions(block.data)"
          :series="(block.data.data || []).map(v => Number(v) || 0)"
          height="220" />
      </div>

      <!-- text -->
      <div v-else-if="block.type === 'text'"
           class="kpi_preview_text" :class="'size_' + block.data.size">
        {{ block.data.content }}
      </div>

      <!-- table -->
      <div v-else-if="block.type === 'table'" class="kpi_preview_table_wrapper">
        <table class="kpi_preview_table">
          <thead>
            <tr>
              <th v-for="h in block.data.headers" :key="h"
                  :style="{ background: copil.color }">{{ h }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(row, ri) in block.data.rows" :key="ri">
              <td v-for="(cell, ci) in row" :key="ci">{{ cell }}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- checklist -->
      <div v-else-if="block.type === 'checklist'" class="kpi_preview_checklist">
        <div v-for="(item, i) in block.data.items" :key="i"
             class="kpi_preview_check_item" :class="{ done: item.done }">
          <span class="kpi_preview_check_icon">{{ item.done ? '✅' : '⬜' }}</span>
          <span>{{ item.text }}</span>
        </div>
      </div>

      <!-- timeline -->
      <div v-else-if="block.type === 'timeline'" class="kpi_preview_timeline">
        <div v-for="(ev, i) in block.data.events" :key="i"
             class="kpi_preview_timeline_event" :class="'status_' + ev.status">
          <div class="kpi_preview_timeline_dot" :style="{ background: copil.color }"></div>
          <div class="kpi_preview_timeline_content">
            <span class="kpi_preview_timeline_date">{{ ev.date }}</span>
            <strong>{{ ev.title }}</strong>
            <p v-if="ev.desc">{{ ev.desc }}</p>
          </div>
        </div>
      </div>

      <!-- quote -->
      <div v-else-if="block.type === 'quote'" class="kpi_preview_quote"
           :style="{ borderLeftColor: copil.color }">
        <p>{{ deckQuote(block.data.text, copil.lang) }}</p>
        <div class="kpi_preview_quote_author">
          — {{ block.data.author }}
          <span v-if="block.data.role">· {{ block.data.role }}</span>
        </div>
      </div>

      <!-- action_plan -->
      <div v-else-if="block.type === 'action_plan'" class="kpi_preview_table_wrapper">
        <table class="kpi_preview_table">
          <thead>
            <tr>
              <th :style="{ background: copil.color }">{{ t('copil_action_what') }}</th>
              <th :style="{ background: copil.color }">{{ t('copil_action_who') }}</th>
              <th :style="{ background: copil.color }">{{ t('copil_action_when') }}</th>
              <th :style="{ background: copil.color }">{{ t('copil_action_status') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(a, ai) in block.data.actions" :key="ai">
              <td>{{ a.what }}</td>
              <td>{{ a.who }}</td>
              <td>{{ a.when }}</td>
              <td>
                <span class="status_badge" :class="a.status">
                  {{ t('copil_status_' + a.status) }}
                </span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- image -->
      <div v-else-if="block.type === 'image'" class="kpi_preview_image">
        <img v-if="imageSrc(block)" :src="imageSrc(block)" :alt="block.data.caption" />
        <span v-if="block.data.caption" class="kpi_preview_image_caption">{{ block.data.caption }}</span>
      </div>

      <!-- divider -->
      <hr v-else-if="block.type === 'divider'" class="kpi_preview_divider" />

    </div>
  </div>

  <!-- Footer -->
  <div class="kpi_preview_footer">
    <span>{{ copil.clientName }}</span>
    <span>{{ copil.period }}</span>
    <span>Scalyo</span>
  </div>
</div>
</template>

<script setup>
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { useKpiStore } from '@/stores/kpis'
import { useI18n } from 'vue-i18n'
import { deckNumber, deckQuote } from '@/utils/copilFormat'

const route = useRoute()
const store = useKpiStore()
const { t } = useI18n({ useScope: 'global' })

const copil = computed(() => store.getCopil(route.params.id) || {})
const visibleBlocks = computed(() =>
  (copil.value.blocks || []).filter(b => b.visible !== false)
)
// COPIL-I18N: numbers and quotation marks in the DECK's language (copils.lang)
function num(v) { return deckNumber(v, copil.value.lang) }
function axisNum(v) { return deckNumber(v, copil.value.lang) }
function imageSrc(block) {
  const d = block.data || {}
  if (d.path) { store.resolveMedia(d.path); return store.mediaUrls[d.path] || '' }
  return d.url || ''
}
const coverGradient = computed(() => {
  const c = copil.value.color || '#7c3aed'
  return `linear-gradient(135deg, ${c}dd, ${c}99)`
})

// ApexCharts helpers
function barOptions(data, color) {
  return {
    chart: { toolbar: { show: false }, animations: { enabled: true } },
    colors: data.datasets.map(d => d.color || color || '#7c3aed'),
    xaxis: { categories: data.labels },
    yaxis: { labels: { formatter: axisNum } },
    grid: { borderColor: '#f3f4f6' },
    plotOptions: { bar: { borderRadius: 4 } },
    dataLabels: { enabled: false },
  }
}
function barSeries(data) {
  return data.datasets.map(d => ({ name: d.label, data: d.data }))
}
function lineOptions(data, color) {
  return {
    chart: { toolbar: { show: false } },
    colors: data.datasets.map(d => d.color || color || '#7c3aed'),
    xaxis: { categories: data.labels },
    yaxis: { labels: { formatter: axisNum } },
    stroke: { curve: 'smooth', width: 3 },
    grid: { borderColor: '#f3f4f6' },
    dataLabels: { enabled: false },
  }
}
function lineSeries(data) {
  return data.datasets.map(d => ({ name: d.label, data: d.data }))
}
function donutOptions(data) {
  return {
    labels: data.labels,
    colors: data.colors,
    legend: { position: 'bottom' },
    dataLabels: { formatter: (pct) => deckNumber(pct, copil.value.lang, { maximumFractionDigits: 1 }) + ' %' },
    dataLabels: { enabled: true },
    plotOptions: { pie: { donut: { size: '60%' } } },
  }
}
</script>

<style scoped>
.kpv { max-width: 900px; margin: 0 auto; padding: 0 24px 48px; }

.kpi_preview_cover {
  border-radius: 16px;
  padding: 64px 48px;
  margin-bottom: 40px;
  color: #fff;
  text-align: center;
}
.kpi_preview_logo_placeholder {
  width: 72px; height: 72px;
  background: rgba(255,255,255,0.2);
  border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  font-size: 2rem; font-weight: 800;
  margin: 0 auto 24px;
}
.kpi_preview_cover h1 { font-size: 2.2rem; font-weight: 800; margin-bottom: 8px; }
.kpi_preview_cover p { font-size: 1.1rem; opacity: 0.85; margin-bottom: 24px; }
.kpi_preview_cover_meta {
  display: flex; gap: 24px; justify-content: center;
  font-size: 0.9rem; opacity: 0.75;
}

.kpi_preview_block {
  background: var(--bg-card);
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  padding: 28px;
  margin-bottom: 20px;
  box-shadow: 0 2px 8px rgba(0,0,0,0.04);
}
.kpi_preview_block_title {
  font-size: 1rem; font-weight: 700;
  margin-bottom: 20px; color: #111;
}

.kpi_preview_kpi_grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  gap: 16px;
}
.kpi_preview_kpi_card {
  background: #f9fafb;
  border-radius: 8px;
  padding: 16px;
  border-top: 3px solid #e5e7eb;
  text-align: center;
}
.kpi_preview_kpi_value {
  font-size: 1.8rem; font-weight: 800;
  line-height: 1;
}
.kpi_preview_kpi_unit { font-size: 0.9rem; font-weight: 400; }
.kpi_preview_kpi_label { font-size: 0.75rem; color: #6b7280; margin-top: 6px; }
.trend_up { color: #10b981; }
.trend_down { color: #ef4444; }
.trend_stable { color: #f59e0b; }

.kpi_preview_kpi_single { text-align: center; padding: 20px 0; }
.kpi_preview_single_value { font-size: 3rem; font-weight: 800; }
.kpi_preview_single_unit { font-size: 1.2rem; font-weight: 400; }
.kpi_preview_single_label { font-size: 1rem; color: #6b7280; margin-top: 8px; }
.kpi_preview_single_previous { font-size: 0.8rem; color: #9ca3af; margin-top: 4px; }

.kpi_preview_text.size_small { font-size: 0.85rem; }
.kpi_preview_text.size_normal { font-size: 1rem; }
.kpi_preview_text.size_large { font-size: 1.2rem; }
.kpi_preview_text.size_title { font-size: 1.5rem; font-weight: 700; }
.kpi_preview_text { line-height: 1.7; color: #374151; white-space: pre-wrap; }

.kpi_preview_table_wrapper { overflow-x: auto; }
.kpi_preview_table { width: 100%; border-collapse: collapse; font-size: 0.88rem; }
.kpi_preview_table th {
  color: #fff; padding: 10px 14px;
  text-align: left; font-weight: 600;
}
.kpi_preview_table td {
  padding: 10px 14px;
  border-bottom: 1px solid #f3f4f6;
}
.kpi_preview_table tr:nth-child(even) td { background: #f9fafb; }

.kpi_preview_checklist { display: flex; flex-direction: column; gap: 10px; }
.kpi_preview_check_item {
  display: flex; align-items: center; gap: 10px;
  font-size: 0.9rem; padding: 8px 12px;
  background: #f9fafb; border-radius: 6px;
}
.kpi_preview_check_item.done { text-decoration: line-through; opacity: 0.6; }

.kpi_preview_timeline { display: flex; flex-direction: column; gap: 0; }
.kpi_preview_timeline_event {
  display: flex; gap: 16px;
  padding: 12px 0;
  border-left: 2px solid #e5e7eb;
  padding-left: 20px;
  position: relative;
}
.kpi_preview_timeline_dot {
  position: absolute; left: -7px; top: 16px;
  width: 12px; height: 12px;
  border-radius: 50%;
}
.kpi_preview_timeline_date { font-size: 0.75rem; color: #9ca3af; }
.kpi_preview_timeline_content strong { display: block; font-size: 0.9rem; }
.kpi_preview_timeline_content p { font-size: 0.82rem; color: #6b7280; margin-top: 2px; }

.kpi_preview_quote {
  border-left: 4px solid;
  padding: 16px 24px;
  background: #f9fafb;
  border-radius: 0 8px 8px 0;
}
.kpi_preview_quote p { font-size: 1.05rem; font-style: italic; color: #374151; }
.kpi_preview_quote_author { font-size: 0.82rem; color: #9ca3af; margin-top: 12px; }

.status_badge {
  padding: 3px 10px; border-radius: 99px;
  font-size: 0.72rem; font-weight: 700;
}
.status_badge.todo { background: #f3f4f6; color: #6b7280; }
.status_badge.progress { background: #dbeafe; color: #1d4ed8; }
.status_badge.done { background: #d1fae5; color: #065f46; }

.kpi_preview_image { text-align: center; }
.kpi_preview_image img { max-width: 100%; border-radius: 8px; }
.kpi_preview_image_caption { display: block; font-size: 0.78rem; color: #9ca3af; margin-top: 8px; }

.kpi_preview_divider { border: none; border-top: 1px solid #e5e7eb; margin: 8px 0; }

.kpi_preview_footer {
  display: flex; justify-content: space-between;
  font-size: 0.75rem; color: #9ca3af;
  padding-top: 24px;
  border-top: 1px solid #e5e7eb;
  margin-top: 40px;
}
</style>

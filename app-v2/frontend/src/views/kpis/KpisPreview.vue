<template>
<div class="kpv">
  <!-- Couverture -->
  <div class="kpv-cover" :style="{ background: coverGradient }">
    <div class="kpv-cover-inner">
      <div class="kpv-logo-placeholder" v-if="!copil.clientLogo">
        {{ copil.clientName?.charAt(0) || 'C' }}
      </div>
      <h1>{{ copil.title }}</h1>
      <p>{{ copil.subtitle }}</p>
      <div class="kpv-cover-meta">
        <span>{{ copil.period }}</span>
        <span>{{ copil.clientName }}</span>
        <span>{{ copil.presenter }}</span>
      </div>
    </div>
  </div>

  <!-- Blocs -->
  <div class="kpv-blocks">
    <div v-for="block in visibleBlocks" :key="block.id"
         class="kpv-block" :class="'kpv-' + block.type">
      <h3 v-if="block.title" class="kpv-block-title">{{ block.title }}</h3>

      <!-- kpi_grid -->
      <div v-if="block.type === 'kpi_grid'" class="kpv-kpi-grid">
        <div v-for="(kpi, i) in block.data.kpis" :key="i"
             class="kpv-kpi-card" :style="{ borderTopColor: kpi.color }">
          <div class="kpv-kpi-value" :style="{ color: kpi.color }">
            {{ num(kpi.value) }}<span v-if="kpi.unit" class="kpv-kpi-unit">{{ kpi.unit }}</span>
          </div>
          <div class="kpv-kpi-label">{{ kpi.label }}</div>
          <div class="kpv-kpi-trend" v-if="kpi.trend">
            <span :class="'trend-' + kpi.trend">
              {{ kpi.trend === 'up' ? '↑' : kpi.trend === 'down' ? '↓' : '→' }}
            </span>
          </div>
        </div>
      </div>

      <!-- kpi_single -->
      <div v-else-if="block.type === 'kpi_single'" class="kpv-kpi-single">
        <div class="kpv-single-value" :style="{ color: block.data.color }">
          {{ num(block.data.value) }}
          <span v-if="block.data.unit" class="kpv-single-unit">{{ block.data.unit }}</span>
        </div>
        <div class="kpv-single-label">{{ block.data.label }}</div>
        <div class="kpv-single-prev" v-if="block.data.previous">
          {{ t('copil_prev_vs') }} {{ num(block.data.previous) }} {{ block.data.unit }}
        </div>
      </div>

      <!-- chart_bar -->
      <div v-else-if="block.type === 'chart_bar'" class="kpv-chart">
        <apexchart :key="'bar-' + block.id" type="bar"
          :options="barOptions(block.data, copil.color)"
          :series="barSeries(block.data)"
          height="220" />
      </div>

      <!-- chart_line -->
      <div v-else-if="block.type === 'chart_line'" class="kpv-chart">
        <apexchart :key="'line-' + block.id" type="line"
          :options="lineOptions(block.data, copil.color)"
          :series="lineSeries(block.data)"
          height="220" />
      </div>

      <!-- chart_donut -->
      <div v-else-if="block.type === 'chart_donut'" class="kpv-chart">
        <apexchart :key="'donut-' + block.id" type="donut"
          :options="donutOptions(block.data)"
          :series="(block.data.data || []).map(v => Number(v) || 0)"
          height="220" />
      </div>

      <!-- text -->
      <div v-else-if="block.type === 'text'"
           class="kpv-text" :class="'sz-' + block.data.size">
        {{ block.data.content }}
      </div>

      <!-- table -->
      <div v-else-if="block.type === 'table'" class="kpv-table-wrap">
        <table class="kpv-table">
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
      <div v-else-if="block.type === 'checklist'" class="kpv-checklist">
        <div v-for="(item, i) in block.data.items" :key="i"
             class="kpv-check-item" :class="{ done: item.done }">
          <span class="kpv-check-icon">{{ item.done ? '✅' : '⬜' }}</span>
          <span>{{ item.text }}</span>
        </div>
      </div>

      <!-- timeline -->
      <div v-else-if="block.type === 'timeline'" class="kpv-timeline">
        <div v-for="(ev, i) in block.data.events" :key="i"
             class="kpv-tl-event" :class="'st-' + ev.status">
          <div class="kpv-tl-dot" :style="{ background: copil.color }"></div>
          <div class="kpv-tl-content">
            <span class="kpv-tl-date">{{ ev.date }}</span>
            <strong>{{ ev.title }}</strong>
            <p v-if="ev.desc">{{ ev.desc }}</p>
          </div>
        </div>
      </div>

      <!-- quote -->
      <div v-else-if="block.type === 'quote'" class="kpv-quote"
           :style="{ borderLeftColor: copil.color }">
        <p>{{ deckQuote(block.data.text, copil.lang) }}</p>
        <div class="kpv-quote-author">
          — {{ block.data.author }}
          <span v-if="block.data.role">· {{ block.data.role }}</span>
        </div>
      </div>

      <!-- action_plan -->
      <div v-else-if="block.type === 'action_plan'" class="kpv-table-wrap">
        <table class="kpv-table">
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
                <span class="status-badge" :class="a.status">
                  {{ t('copil_status_' + a.status) }}
                </span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- image -->
      <div v-else-if="block.type === 'image'" class="kpv-image">
        <img v-if="imageSrc(block)" :src="imageSrc(block)" :alt="block.data.caption" />
        <span v-if="block.data.caption" class="kpv-image-caption">{{ block.data.caption }}</span>
      </div>

      <!-- divider -->
      <hr v-else-if="block.type === 'divider'" class="kpv-divider" />

    </div>
  </div>

  <!-- Footer -->
  <div class="kpv-footer">
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
// COPIL-I18N : nombres et guillemets dans la langue du DECK (copils.lang)
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

.kpv-cover {
  border-radius: 16px;
  padding: 64px 48px;
  margin-bottom: 40px;
  color: #fff;
  text-align: center;
}
.kpv-logo-placeholder {
  width: 72px; height: 72px;
  background: rgba(255,255,255,0.2);
  border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  font-size: 2rem; font-weight: 800;
  margin: 0 auto 24px;
}
.kpv-cover h1 { font-size: 2.2rem; font-weight: 800; margin-bottom: 8px; }
.kpv-cover p { font-size: 1.1rem; opacity: 0.85; margin-bottom: 24px; }
.kpv-cover-meta {
  display: flex; gap: 24px; justify-content: center;
  font-size: 0.9rem; opacity: 0.75;
}

.kpv-block {
  background: var(--bg-card);
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  padding: 28px;
  margin-bottom: 20px;
  box-shadow: 0 2px 8px rgba(0,0,0,0.04);
}
.kpv-block-title {
  font-size: 1rem; font-weight: 700;
  margin-bottom: 20px; color: #111;
}

.kpv-kpi-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  gap: 16px;
}
.kpv-kpi-card {
  background: #f9fafb;
  border-radius: 8px;
  padding: 16px;
  border-top: 3px solid #e5e7eb;
  text-align: center;
}
.kpv-kpi-value {
  font-size: 1.8rem; font-weight: 800;
  line-height: 1;
}
.kpv-kpi-unit { font-size: 0.9rem; font-weight: 400; }
.kpv-kpi-label { font-size: 0.75rem; color: #6b7280; margin-top: 6px; }
.trend-up { color: #10b981; }
.trend-down { color: #ef4444; }
.trend-stable { color: #f59e0b; }

.kpv-kpi-single { text-align: center; padding: 20px 0; }
.kpv-single-value { font-size: 3rem; font-weight: 800; }
.kpv-single-unit { font-size: 1.2rem; font-weight: 400; }
.kpv-single-label { font-size: 1rem; color: #6b7280; margin-top: 8px; }
.kpv-single-prev { font-size: 0.8rem; color: #9ca3af; margin-top: 4px; }

.kpv-text.sz-small { font-size: 0.85rem; }
.kpv-text.sz-normal { font-size: 1rem; }
.kpv-text.sz-large { font-size: 1.2rem; }
.kpv-text.sz-title { font-size: 1.5rem; font-weight: 700; }
.kpv-text { line-height: 1.7; color: #374151; white-space: pre-wrap; }

.kpv-table-wrap { overflow-x: auto; }
.kpv-table { width: 100%; border-collapse: collapse; font-size: 0.88rem; }
.kpv-table th {
  color: #fff; padding: 10px 14px;
  text-align: left; font-weight: 600;
}
.kpv-table td {
  padding: 10px 14px;
  border-bottom: 1px solid #f3f4f6;
}
.kpv-table tr:nth-child(even) td { background: #f9fafb; }

.kpv-checklist { display: flex; flex-direction: column; gap: 10px; }
.kpv-check-item {
  display: flex; align-items: center; gap: 10px;
  font-size: 0.9rem; padding: 8px 12px;
  background: #f9fafb; border-radius: 6px;
}
.kpv-check-item.done { text-decoration: line-through; opacity: 0.6; }

.kpv-timeline { display: flex; flex-direction: column; gap: 0; }
.kpv-tl-event {
  display: flex; gap: 16px;
  padding: 12px 0;
  border-left: 2px solid #e5e7eb;
  padding-left: 20px;
  position: relative;
}
.kpv-tl-dot {
  position: absolute; left: -7px; top: 16px;
  width: 12px; height: 12px;
  border-radius: 50%;
}
.kpv-tl-date { font-size: 0.75rem; color: #9ca3af; }
.kpv-tl-content strong { display: block; font-size: 0.9rem; }
.kpv-tl-content p { font-size: 0.82rem; color: #6b7280; margin-top: 2px; }

.kpv-quote {
  border-left: 4px solid;
  padding: 16px 24px;
  background: #f9fafb;
  border-radius: 0 8px 8px 0;
}
.kpv-quote p { font-size: 1.05rem; font-style: italic; color: #374151; }
.kpv-quote-author { font-size: 0.82rem; color: #9ca3af; margin-top: 12px; }

.status-badge {
  padding: 3px 10px; border-radius: 99px;
  font-size: 0.72rem; font-weight: 700;
}
.status-badge.todo { background: #f3f4f6; color: #6b7280; }
.status-badge.progress { background: #dbeafe; color: #1d4ed8; }
.status-badge.done { background: #d1fae5; color: #065f46; }

.kpv-image { text-align: center; }
.kpv-image img { max-width: 100%; border-radius: 8px; }
.kpv-image-caption { display: block; font-size: 0.78rem; color: #9ca3af; margin-top: 8px; }

.kpv-divider { border: none; border-top: 1px solid #e5e7eb; margin: 8px 0; }

.kpv-footer {
  display: flex; justify-content: space-between;
  font-size: 0.75rem; color: #9ca3af;
  padding-top: 24px;
  border-top: 1px solid #e5e7eb;
  margin-top: 40px;
}
</style>

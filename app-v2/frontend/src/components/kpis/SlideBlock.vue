<template>
<div class="sb">
  <h2 v-if="block.title" class="slide_block_title">{{ block.title }}</h2>

  <!-- KPI unique -->
  <div v-if="block.type === 'kpi_single'" class="slide_block_kpi_single">
    <span class="slide_block_kpi_value" :style="{ color: block.data.color || 'var(--sb-accent)' }">{{ num(block.data.value) }}<small v-if="block.data.unit">{{ block.data.unit }}</small></span>
    <span class="slide_block_kpi_label">{{ block.data.label }}</span>
    <div v-if="block.data.target" class="slide_block_kpi_target_wrapper">
      <div class="slide_block_kpi_bar"><div class="slide_block_kpi_fill" :style="{ width: pct(block.data.value, block.data.target) + '%', background: block.data.color || 'var(--sb-accent)' }" /></div>
      <span class="slide_block_kpi_target">{{ t('copil_wiz_target') }} : {{ num(block.data.target) }}{{ block.data.unit }}</span>
    </div>
  </div>

  <!-- Grille KPIs -->
  <div v-else-if="block.type === 'kpi_grid'" class="slide_block_kpi_grid">
    <div v-for="(k, i) in block.data.kpis" :key="i" class="slide_block_gauge_card" :style="{ animationDelay: i * 0.12 + 's' }">
      <span class="slide_block_gauge_label">{{ k.label }}</span>
      <span class="slide_block_gauge_value" :style="{ color: k.color || 'var(--sb-accent)' }">{{ num(k.value) }}<small v-if="k.unit">{{ k.unit }}</small></span>
      <span v-if="k.target" class="slide_block_gauge_target">/ {{ num(k.target) }}{{ k.unit }}</span>
    </div>
  </div>

  <!-- Bars — all series (COPIL-SERIES-LOST), grouped by category -->
  <div v-else-if="block.type === 'chart_bar'" class="slide_block_chart_wrapper">
    <svg class="slide_block_chart" viewBox="0 0 800 380">
      <g v-for="(cat, i) in categories" :key="i">
        <g v-for="(s, j) in series" :key="j">
          <rect :x="barX(i, j)" :y="370 - barH(s.data[i])" :width="barW" :height="barH(s.data[i])" rx="5" :fill="s.color" opacity="0.92" />
          <text :x="barX(i, j) + barW / 2" :y="358 - barH(s.data[i])" text-anchor="middle" :font-size="series.length > 1 ? 13 : 18" font-weight="700" class="slide_block_svg_text">{{ num(s.data[i]) }}</text>
        </g>
        <text :x="groupX(i) + groupW / 2" :y="378" text-anchor="middle" font-size="13" class="slide_block_svg_muted">{{ trunc(cat) }}</text>
      </g>
    </svg>
    <div v-if="series.length > 1" class="slide_block_legend slide_block_legend_row">
      <div v-for="(s, j) in series" :key="j" class="sbl_item"><span class="sbl_dot" :style="{ background: s.color }" /><span>{{ s.label }}</span></div>
    </div>
  </div>

  <!-- Line — all series -->
  <div v-else-if="block.type === 'chart_line'" class="slide_block_chart_wrapper">
    <svg class="slide_block_chart" viewBox="0 0 800 380">
      <g v-for="(s, j) in series" :key="j">
        <polyline :points="linePoints(s.data)" fill="none" :stroke="s.color" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" />
        <g v-for="(v, i) in s.data" :key="i">
          <circle :cx="lineX(i)" :cy="lineY(v)" r="7" :fill="s.color" />
          <text :x="lineX(i)" :y="lineY(v) - 16" text-anchor="middle" :font-size="series.length > 1 ? 14 : 17" font-weight="700" class="slide_block_svg_text">{{ num(v) }}</text>
        </g>
      </g>
      <text v-for="(cat, i) in categories" :key="'c' + i" :x="lineX(i)" :y="374" text-anchor="middle" font-size="13" class="slide_block_svg_muted">{{ trunc(cat) }}</text>
    </svg>
    <div v-if="series.length > 1" class="slide_block_legend slide_block_legend_row">
      <div v-for="(s, j) in series" :key="j" class="sbl_item"><span class="sbl_dot" :style="{ background: s.color }" /><span>{{ s.label }}</span></div>
    </div>
  </div>

  <!-- Donut -->
  <div v-else-if="block.type === 'chart_donut'" class="slide_block_donut_wrapper">
    <svg viewBox="0 0 220 220" class="slide_block_donut">
      <circle v-for="(seg, i) in donutSegs" :key="i" cx="110" cy="110" r="80" fill="none" :stroke="seg.color" stroke-width="34" :stroke-dasharray="seg.len + ' ' + (502.6 - seg.len)" :stroke-dashoffset="-seg.offset" transform="rotate(-90 110 110)" />
    </svg>
    <div class="slide_block_legend">
      <div v-for="(l, i) in block.data.labels" :key="i" class="sbl_item">
        <span class="sbl_dot" :style="{ background: block.data.colors?.[i] || 'var(--sb-accent)' }" />
        <span>{{ l }}</span><strong>{{ num(block.data.data?.[i]) }}</strong>
      </div>
    </div>
  </div>

  <!-- Tableau -->
  <table v-else-if="block.type === 'table'" class="slide_block_table">
    <thead><tr><th v-for="(h, i) in block.data.headers" :key="i">{{ h }}</th></tr></thead>
    <tbody><tr v-for="(r, i) in block.data.rows" :key="i"><td v-for="(c, j) in r" :key="j">{{ c }}</td></tr></tbody>
  </table>

  <!-- Plan d'action -->
  <table v-else-if="block.type === 'action_plan'" class="slide_block_table">
    <thead><tr><th>{{ t('copil_action_what') }}</th><th>{{ t('copil_action_who') }}</th><th>{{ t('copil_action_when') }}</th><th>{{ t('copil_action_status') }}</th></tr></thead>
    <tbody><tr v-for="(a, i) in block.data.actions" :key="i">
      <td>{{ a.what }}</td><td>{{ a.who }}</td><td>{{ a.when }}</td>
      <td><span class="slide_block_status" :class="a.status">{{ t('copil_status_' + a.status) }}</span></td>
    </tr></tbody>
  </table>

  <!-- Checklist -->
  <ul v-else-if="block.type === 'checklist'" class="slide_block_checklist">
    <li v-for="(it, i) in block.data.items" :key="i" :class="{ done: it.done }"><span>{{ it.done ? '✓' : '○' }}</span>{{ it.text }}</li>
  </ul>

  <!-- Timeline -->
  <div v-else-if="block.type === 'timeline'" class="slide_block_timeline">
    <div v-for="(ev, i) in block.data.events" :key="i" class="slide_block_timeline_event" :class="ev.status">
      <span class="slide_block_timeline_date">{{ ev.date }}</span>
      <div class="slide_block_timeline_dot" /><div class="slide_block_timeline_body"><strong>{{ ev.title }}</strong><p v-if="ev.desc">{{ ev.desc }}</p></div>
    </div>
  </div>

  <!-- Quote — quotation marks of the deck language -->
  <blockquote v-else-if="block.type === 'quote'" class="slide_block_quote">
    <p>{{ deckQuote(block.data.text, lang) }}</p>
    <footer>{{ block.data.author }}<span v-if="block.data.role"> — {{ block.data.role }}</span></footer>
  </blockquote>

  <!-- Texte -->
  <p v-else-if="block.type === 'text'" class="slide_block_text" :class="block.data.size">{{ block.data.content }}</p>

  <!-- Image (uploaded: signed URL resolved by the store; or external URL) -->
  <figure v-else-if="block.type === 'image'" class="slide_block_image">
    <img v-if="imageSrc" :src="imageSrc" :alt="block.data.caption || ''" />
    <figcaption v-if="block.data.caption">{{ block.data.caption }}</figcaption>
  </figure>
</div>
</template>

<script setup>
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { deckNumber, deckQuote } from '@/utils/copilFormat'
import { useKpiStore } from '@/stores/kpis'

const { t, locale } = useI18n({ useScope: 'global' })
const props = defineProps({ block: { type: Object, required: true }, lang: { type: String, default: '' } })
const store = useKpiStore()

const lang = computed(() => props.lang || locale.value)
function num(v) { return deckNumber(v, lang.value) }

const PALETTE = ['#a78bfa', '#60a5fa', '#34d399', '#fbbf24', '#f87171', '#22d3ee']
const series = computed(() => (props.block.data?.datasets || []).slice(0, 6).map((d, j) => ({ label: d.label || '', color: d.color || PALETTE[j % PALETTE.length], data: Array.isArray(d.data) ? d.data : [] })))
const categories = computed(() => props.block.data?.labels || [])
const maxV = computed(() => Math.max(...series.value.flatMap(s => s.data.map(v => Math.abs(Number(v) || 0))), 1))

// Grouped bars: one column per category, one bar per series
const nCat = computed(() => Math.max(categories.value.length, ...series.value.map(s => s.data.length), 1))
const groupW = computed(() => 760 / nCat.value)
function groupX(i) { return 20 + groupW.value * i }
const barW = computed(() => { const n = Math.max(series.value.length, 1); return Math.min(90, (groupW.value * 0.7) / n - 4) })
function barX(i, j) { const n = Math.max(series.value.length, 1); const total = n * barW.value + (n - 1) * 4; return groupX(i) + (groupW.value - total) / 2 + j * (barW.value + 4) }
function barH(v) { return Math.max(4, (Number(v) || 0) / maxV.value * 300) }

function lineX(i) { const n = Math.max(nCat.value - 1, 1); return 40 + (720 / n) * i }
function lineY(v) { return 340 - (Number(v) || 0) / maxV.value * 280 }
function linePoints(data) { return data.map((v, i) => lineX(i) + ',' + lineY(v)).join(' ') }

const donutSegs = computed(() => {
  const data = props.block.data?.data || []
  const total = data.reduce((a, b) => a + (Number(b) || 0), 0) || 1
  const C = 502.6
  let offset = 0
  return data.map((v, i) => {
    const len = (Number(v) || 0) / total * C
    const seg = { len, offset, color: props.block.data.colors?.[i] || PALETTE[i % PALETTE.length] }
    offset += len
    return seg
  })
})

// Image: Storage path (uploaded) → signed URL via the store; otherwise an external URL
const imageSrc = computed(() => {
  const d = props.block.data || {}
  if (d.path) { store.resolveMedia(d.path); return store.mediaUrls[d.path] || '' }
  return d.url || ''
})

function pct(v, target) { const a = Number(v), b = Number(target); return b ? Math.min(100, Math.round((a / b) * 100)) : 0 }
function trunc(s) { s = String(s || ''); return s.length > 14 ? s.slice(0, 13) + '…' : s }
</script>

<style scoped>
/* COPIL-LIGHT-BLANK: no hard-coded color — everything goes through the variables set
   by KpisPresent on .kp (dark) and .kp:not(.dark) (light). */
.sb { width: min(920px, 88vw); margin: 0 auto; animation: sbIn 0.5s ease both; color: var(--sb-text); }
@keyframes sbIn { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: none; } }
.slide_block_title { font-size: 2rem; font-weight: 800; color: var(--sb-text); margin-bottom: 36px; text-align: center; letter-spacing: -0.01em; }

.slide_block_kpi_single { display: flex; flex-direction: column; align-items: center; gap: 10px; }
.slide_block_kpi_value { font-size: 6rem; font-weight: 900; line-height: 1; }
.slide_block_kpi_value small { font-size: 2.4rem; font-weight: 700; opacity: 0.8; margin-left: 6px; }
.slide_block_kpi_label { font-size: 1.15rem; color: var(--sb-muted); text-transform: uppercase; letter-spacing: 0.08em; }
.slide_block_kpi_target_wrapper { width: 360px; margin-top: 18px; text-align: center; }
.slide_block_kpi_bar { height: 8px; background: var(--sb-line); border-radius: 4px; overflow: hidden; margin-bottom: 8px; }
.slide_block_kpi_fill { height: 100%; border-radius: 4px; transition: width 0.8s ease; }
.slide_block_kpi_target { font-size: 0.85rem; color: var(--sb-faint); }

.slide_block_kpi_grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 18px; }
.slide_block_gauge_card { background: var(--sb-card); border: 1px solid var(--sb-line); border-radius: 16px; padding: 26px 20px; text-align: center; animation: sbIn 0.5s ease both; }
.slide_block_gauge_label { display: block; font-size: 0.78rem; color: var(--sb-muted); text-transform: uppercase; letter-spacing: 0.06em; margin-bottom: 10px; }
.slide_block_gauge_value { font-size: 2.6rem; font-weight: 900; }
.slide_block_gauge_value small { font-size: 1.2rem; margin-left: 4px; }
.slide_block_gauge_target { display: block; font-size: 0.8rem; color: var(--sb-faint); margin-top: 6px; }

.slide_block_chart_wrapper { display: flex; flex-direction: column; align-items: center; gap: 14px; }
.slide_block_chart { width: 100%; }
.slide_block_svg_text { fill: var(--sb-text); }
.slide_block_svg_muted { fill: var(--sb-muted); }

.slide_block_donut_wrapper { display: flex; align-items: center; justify-content: center; gap: 56px; flex-wrap: wrap; }
.slide_block_donut { width: 300px; }
.slide_block_legend { display: flex; flex-direction: column; gap: 14px; }
.slide_block_legend_row { flex-direction: row; flex-wrap: wrap; justify-content: center; gap: 22px; }
.sbl_item { display: flex; align-items: center; gap: 10px; font-size: 1.05rem; color: var(--sb-text); }
.sbl_item strong { color: var(--sb-text); margin-left: 6px; }
.sbl_dot { width: 14px; height: 14px; border-radius: 4px; }

.slide_block_table { width: 100%; border-collapse: collapse; font-size: 1rem; color: var(--sb-text); }
.slide_block_table th { text-align: left; font-size: 0.78rem; text-transform: uppercase; letter-spacing: 0.06em; color: var(--sb-muted); padding: 10px 14px; border-bottom: 1px solid var(--sb-line-strong); }
.slide_block_table td { padding: 12px 14px; border-bottom: 1px solid var(--sb-line); }
.slide_block_status { padding: 3px 12px; border-radius: 14px; font-size: 0.78rem; font-weight: 700; }
.slide_block_status.done { background: rgba(16,185,129,0.2); color: var(--sb-ok); }
.slide_block_status.progress { background: rgba(59,130,246,0.2); color: var(--sb-doing); }
.slide_block_status.todo { background: var(--sb-card); color: var(--sb-muted); }

.slide_block_checklist { list-style: none; padding: 0; display: flex; flex-direction: column; gap: 14px; font-size: 1.2rem; color: var(--sb-text); }
.slide_block_checklist li span { margin-right: 14px; color: var(--sb-faint); }
.slide_block_checklist li.done span { color: var(--sb-ok); }

.slide_block_timeline { display: flex; flex-direction: column; gap: 20px; }
.slide_block_timeline_event { display: grid; grid-template-columns: 110px 20px 1fr; gap: 14px; align-items: start; }
.slide_block_timeline_date { font-size: 0.85rem; color: var(--sb-muted); text-align: right; padding-top: 2px; }
.slide_block_timeline_dot { width: 12px; height: 12px; border-radius: 50%; background: var(--sb-line-strong); margin-top: 5px; }
.slide_block_timeline_event.done .slide_block_timeline_dot { background: var(--sb-ok); }
.slide_block_timeline_event.progress .slide_block_timeline_dot { background: var(--sb-doing); }
.slide_block_timeline_body { color: var(--sb-text); }
.slide_block_timeline_body strong { color: var(--sb-text); }
.slide_block_timeline_body p { font-size: 0.9rem; color: var(--sb-muted); margin-top: 4px; }

.slide_block_quote { text-align: center; }
.slide_block_quote p { font-size: 1.8rem; font-weight: 600; color: var(--sb-text); line-height: 1.5; font-style: italic; }
.slide_block_quote footer { margin-top: 20px; font-size: 1rem; color: var(--sb-muted); }

.slide_block_text { font-size: 1.3rem; line-height: 1.7; color: var(--sb-text); white-space: pre-wrap; }
.slide_block_text.small { font-size: 1.05rem; }
.slide_block_text.large { font-size: 1.7rem; }
.slide_block_text.title { font-size: 2.2rem; font-weight: 800; text-align: center; }

.slide_block_image { text-align: center; }
.slide_block_image img { max-width: 100%; max-height: 55vh; border-radius: 12px; }
.slide_block_image figcaption { margin-top: 10px; font-size: 0.9rem; color: var(--sb-muted); }
</style>

<script setup>
import { computed, watch, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useAuthStore } from '@/stores/auth'
import { useOxygenRecoveriesStore } from '@/stores/oxygenRecoveries'
import { fmtDate } from '@/lib/formatters'
import { bubbleParams } from './skyBubble'

// ─── OXYGEN Lot 3b — THE SKY (contract R23 29/07/2026) ────────────────────────
// Constellation of the month: ONE bubble per CLOSED day. Each bubble is
// regenerated from seed(user_id:date) + the month's PERSISTED values (energy,
// load_score, progress_count — loaded by recoveries.loadMonth, never the
// rolling 30 d window: determinism does not depend on any window).
// A day without a Closing (missed OR off) = the same neutral space — the Sky does not
// judge. Title = the localized date ONLY: no raw data readable in the SVG.

const { t } = useI18n({ useScope: 'global' })
const auth = useAuthStore()
const recoveries = useOxygenRecoveriesStore()

const COLS = 7
const CELL = 44

const days = computed(() => {
  const today = new Date().toISOString().slice(0, 10)
  const ym = today.slice(0, 7)
  const daysInMonth = new Date(Date.UTC(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)), 0)).getUTCDate()
  const byDate = Object.fromEntries(recoveries.monthRows.map(r => [r.date, r]))
  const out = []
  for (let d = 1; d <= daysInMonth; d++) {
    const date = `${ym}-${String(d).padStart(2, '0')}`
    const row = byDate[date]
    const col = (d - 1) % COLS
    const line = Math.floor((d - 1) / COLS)
    const cx = col * CELL + CELL / 2
    const cy = line * CELL + CELL / 2
    if (row && date <= today) {
      const b = bubbleParams({
        userId: auth.user?.id || '',
        date,
        energy: recoveries.monthCheckins[date],
        load: recoveries.monthDaily[date],
        progress: row.progress_count,
      })
      out.push({ date, cx: cx + b.dx, cy: cy + b.dy, b })
    } else {
      out.push({ date, cx, cy, b: null, future: date > today })
    }
  }
  return out
})

const rows = computed(() => Math.ceil(days.value.length / COLS))
const hasBubbles = computed(() => days.value.some(d => d.b))

onMounted(() => {
  if (!recoveries.monthLoaded) recoveries.loadMonth()
})

// BUG OXY-CIEL-REFRESH (killed 29/07, seen while rendering run 1): closeToday invalidates
// monthLoaded but nothing reloaded — the bubble of the day only appeared after a
// reload. The Sky now reloads as soon as its data is invalidated.
watch(() => recoveries.monthLoaded, (v) => { if (!v) recoveries.loadMonth() })
</script>

<template>
  <div class="oxygen_sky">
    <svg
      class="oxygen_sky_svg"
      :viewBox="`0 0 ${COLS * CELL} ${rows * CELL}`"
      role="img" :aria-label="t('oxy_sky_title')"
    >
      <g v-for="d in days" :key="d.date">
        <template v-if="d.b">
          <circle
            :cx="d.cx" :cy="d.cy" :r="d.b.r"
            :fill="`hsl(${d.b.hue} ${d.b.sat}% ${d.b.light}%)`"
            :fill-opacity="d.b.depth"
          >
            <title>{{ fmtDate(d.date) }}</title>
          </circle>
          <circle
            :cx="d.cx" :cy="d.cy" :r="d.b.r + 4" fill="none"
            :stroke="`hsl(${d.b.hue} ${d.b.sat}% ${d.b.light}%)`"
            stroke-opacity="0.3"
          />
          <circle
            v-for="(dot, i) in d.b.dots" :key="i"
            :cx="d.cx + Math.cos(dot.a) * d.b.r * dot.d"
            :cy="d.cy + Math.sin(dot.a) * d.b.r * dot.d"
            :r="dot.s" fill="#fff" fill-opacity="0.5"
          />
        </template>
        <circle
          v-else
          :cx="d.cx" :cy="d.cy" r="1.6"
          fill="currentColor" :fill-opacity="d.future ? 0.08 : 0.18"
          class="oxygen_sky_dot"
        >
          <title>{{ fmtDate(d.date) }}</title>
        </circle>
      </g>
    </svg>
    <p v-if="!hasBubbles" class="oxygen_sky_empty">{{ t('oxy_sky_empty') }}</p>
  </div>
</template>

<style scoped>
.oxygen_sky_svg { width: 100%; max-width: 340px; display: block; margin: 0 auto; color: var(--text-muted); }
.oxygen_sky_empty { text-align: center; font-size: 0.8rem; color: var(--text-muted); margin: 10px 0 0; }
</style>

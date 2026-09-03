<script setup>
import { computed, watch, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useAuthStore } from '@/stores/auth'
import { useOxygenRecoveriesStore } from '@/stores/oxygenRecoveries'
import { fmtDate } from '@/lib/formatters'
import { bubbleParams } from './cielBubble'

// ─── OXYGEN Lot 3b — LE CIEL (contrat R23 29/07/2026) ────────────────────────
// Constellation du mois : UNE bulle par journée FERMÉE. Chaque bulle est
// régénérée depuis seed(user_id:date) + valeurs PERSISTÉES du mois (energy,
// load_score, progress_count — chargées par recoveries.loadMonth, jamais la
// fenêtre 30 j glissante : le déterminisme ne dépend d'aucune fenêtre).
// Jour sans Fermeture (manqué OU off) = même espace neutre — le Ciel ne juge
// pas. Title = date localisée SEULE : aucune donnée brute lisible dans le SVG.

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

// BUG OXY-CIEL-REFRESH (tué 29/07, vu au rendu run 1) : closeToday invalide
// monthLoaded mais rien ne rechargeait — la bulle du jour n'apparaissait qu'au
// reload. Le Ciel recharge dès que ses données sont invalidées.
watch(() => recoveries.monthLoaded, (v) => { if (!v) recoveries.loadMonth() })
</script>

<template>
  <div class="oxy-ciel">
    <svg
      class="oxy-ciel-svg"
      :viewBox="`0 0 ${COLS * CELL} ${rows * CELL}`"
      role="img" :aria-label="t('oxy_ciel_title')"
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
          class="oxy-ciel-dot"
        >
          <title>{{ fmtDate(d.date) }}</title>
        </circle>
      </g>
    </svg>
    <p v-if="!hasBubbles" class="oxy-ciel-empty">{{ t('oxy_ciel_empty') }}</p>
  </div>
</template>

<style scoped>
.oxy-ciel-svg { width: 100%; max-width: 340px; display: block; margin: 0 auto; color: var(--text-muted); }
.oxy-ciel-empty { text-align: center; font-size: 0.8rem; color: var(--text-muted); margin: 10px 0 0; }
</style>

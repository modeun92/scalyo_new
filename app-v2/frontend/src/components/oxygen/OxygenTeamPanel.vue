<template>
  <div class="oxyteam">
    <!-- Privacy contract — ALWAYS displayed, whatever the state -->
    <div class="oxygen_privacy">🛡️ <span>{{ t('oxy_team_privacy') }}</span></div>

    <div v-if="team.status === 'loading' || team.status === 'idle'" class="oxygen_card oxyteam_state">
      {{ t('oxy_team_loading') }}
    </div>

    <div v-else-if="team.status === 'disabled'" class="oxygen_card oxyteam_state">
      <strong>{{ t('oxy_team_disabled_title') }}</strong>
      <p>{{ t('oxy_team_disabled_body') }}</p>
    </div>

    <div v-else-if="team.status === 'insufficient'" class="oxygen_card oxyteam_state">
      <strong>{{ t('oxy_team_threshold_title') }}</strong>
      <p>{{ t('oxy_team_threshold_body') }}</p>
    </div>

    <div v-else-if="team.status === 'error' || team.status === 'forbidden'" class="oxygen_card oxyteam_state">
      {{ t('oxy_team_error') }}
    </div>

    <template v-else>
      <p class="oxyteam_meta">{{ t('oxy_team_window', { n: team.data.n }) }}</p>
      <div class="oxyteam_grid">
        <div v-for="m in metrics" :key="m.key" class="oxygen_card oxyteam_card">
          <span class="oxyteam_value">{{ m.display }}</span>
          <span class="oxyteam_label">{{ t(m.label) }}</span>
          <span v-if="m.trend !== null" class="oxyteam_trend">{{ m.trend }} {{ t('oxy_team_trend') }}</span>
          <span v-else class="oxyteam_trend quiet">{{ t('oxy_team_no_trend') }}</span>
        </div>
      </div>
      <p class="oxyteam_note">{{ t('oxy_team_closure_note') }}</p>
      <button class="oxygen_how" @click="how = !how">{{ t('oxy_team_how') }}</button>
      <p v-if="how" class="oxygen_how_body">{{ t('oxy_team_how_body') }}</p>
    </template>
  </div>
</template>

<script setup>
// OXYGEN Lot 4 — MANAGER view of the team loop (growth+, ManagerView tab).
// Anti-compulsion by design: 3 team averages + a trend, never a
// ranking, never anything individual, never time-spent. Zero red (oxygen
// palette). Privacy is a DISPLAYED CONTRACT, not a footnote.
import { ref, computed, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useOxygenTeamStore } from '@/stores/oxygenTeam'
import { fmtNumber } from '@/lib/formatters'
import '@/assets/oxygen.css'

const { t } = useI18n({ useScope: 'global' })
const team = useOxygenTeamStore()
const how = ref(false)

onMounted(() => { team.load() })

// v = a number or null (SQL avg over zero rows) → never an invented figure (R21)
function show(v, pct = false) {
  if (typeof v !== 'number') return '—'
  return pct ? `${fmtNumber(v)} %` : fmtNumber(v)
}
// Trend: current − previous delta, null if either value is missing
function trend(cur, prev, pct = false) {
  if (typeof cur !== 'number' || typeof prev !== 'number') return null
  const d = Math.round((cur - prev) * 10) / 10
  const arrow = d > 0 ? '↗' : d < 0 ? '↘' : '→'
  const num = `${d > 0 ? '+' : ''}${fmtNumber(d)}${pct ? ' pt' : ''}`
  return `${arrow} ${num}`
}

const metrics = computed(() => {
  const cur = team.data?.current || {}
  const prev = team.data?.previous || null
  return [
    { key: 'index', label: 'oxy_team_index', display: show(cur.index_avg),
      trend: trend(cur.index_avg, prev?.index_avg) },
    { key: 'load', label: 'oxy_team_load', display: show(cur.load_avg),
      trend: trend(cur.load_avg, prev?.load_avg) },
    { key: 'closure', label: 'oxy_team_closure', display: show(cur.closure_rate, true),
      trend: trend(cur.closure_rate, prev?.closure_rate, true) },
  ]
})
</script>

<style scoped>
.oxyteam { max-width: 800px; }
.oxyteam_state { font-size: 0.85rem; color: var(--text-secondary); line-height: 1.5; }
.oxyteam_state strong { display: block; color: var(--text); margin-bottom: 6px; font-size: 0.9rem; }
.oxyteam_state p { margin: 0; }
.oxyteam_meta { font-size: 0.8rem; color: var(--text-muted); margin: 0 0 14px; }
.oxyteam_grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px; }
.oxyteam_card { display: flex; flex-direction: column; gap: 4px; margin-bottom: 0; }
.oxyteam_value { font-size: 1.9rem; font-weight: 800; color: var(--purple); line-height: 1.1; }
.oxyteam_label { font-size: 0.76rem; color: var(--text-secondary); }
.oxyteam_trend { font-size: 0.74rem; color: var(--text-muted); margin-top: 4px; }
.oxyteam_trend.quiet { opacity: 0.6; }
.oxyteam_note { font-size: 0.74rem; color: var(--text-muted); margin: 14px 0 0; }
@media (max-width: 768px) {
  .oxyteam_grid { grid-template-columns: 1fr; }
}
</style>

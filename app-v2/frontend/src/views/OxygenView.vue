<template>
  <div class="oxygen_view">
    <!-- ── Header: Oxygen + privacy (self-only, formula visible) ── -->
    <h1>🫧 Oxygen</h1>
    <div class="oxygen_privacy">
      <span>🔒</span>
      <span>{{ t('oxy_privacy') }}</span>
    </div>

    <!-- ── Index of the day — "—" without a check-in (R21, never invented) ── -->
    <section class="oxygen_card oxygen_index_card">
      <div class="oxygen_index_main">
        <span class="oxygen_index_big">{{ displayIndex }}</span>
        <div class="oxygen_index_meta">
          <strong>{{ t('oxy_index_label') }}</strong>
          <span v-if="!hasIndex" class="oxygen_index_hint">{{ t('oxy_index_none_hint') }}</span>
        </div>
      </div>
      <p v-if="engine.divergenceActive" class="oxygen_div">{{ t('oxy_divergence') }}</p>
      <button class="oxygen_how" @click="showHow = !showHow">{{ t('oxy_how_title') }}</button>
      <p v-if="showHow" class="oxygen_how_body">{{ t('oxy_how_body', { load: loadStore.loadScore }) }}</p>
    </section>

    <!-- ── Load weather — real components only (pure read) ── -->
    <section class="oxygen_card">
      <h2>{{ t('oxy_weather_title') }}</h2>
      <div class="oxygen_weather_line">
        <span class="oxygen_load_number">{{ loadStore.loadScore }}</span>
        <span class="oxygen_load_label">{{ t('oxy_load_label') }}</span>
      </div>
      <div class="oxygen_chips">
        <span v-for="c in componentChips" :key="c.key" class="oxygen_chip" :class="{ quiet: !c.value }">
          {{ c.value }} {{ t(c.label) }}
        </span>
      </div>
    </section>

    <!-- ── Check-in of the day — SAME component and SAME write as the dot ── -->
    <section class="oxygen_card">
      <h2>{{ t('oxy_checkin_title') }}</h2>
      <OxygenCheckinForm />
    </section>

    <!-- ── Streak + custom days off ── -->
    <section class="oxygen_card">
      <h2>{{ t('oxy_series_title') }}</h2>
      <p class="oxygen_streak_line">
        {{ streakLine }}
      </p>
      <p class="oxygen_pardon_hint">{{ t('oxy_pardon_hint') }}</p>

      <button class="oxygen_how" @click="showOffdays = !showOffdays">⚙ {{ t('oxy_offdays_title') }}</button>
      <div v-if="showOffdays" class="oxygen_offdays">
        <p class="oxygen_offdays_hint">{{ t('oxy_offdays_hint') }}</p>
        <div class="oxygen_days_row">
          <button
            v-for="d in weekDays"
            :key="d.day"
            class="oxygen_day_toggle"
            :class="{ off: prefs.weeklyOff.includes(d.day) }"
            :aria-pressed="prefs.weeklyOff.includes(d.day)"
            @click="prefs.toggleWeeklyOff(d.day)"
          >
            {{ d.label }}
          </button>
        </div>
        <div class="oxygen_offdates">
          <label class="oxygen_offdates_label" for="oxy-offdate">{{ t('oxy_offdays_dates_label') }}</label>
          <div class="oxygen_offdate_add">
            <input id="oxy-offdate" v-model="newOffDate" type="date" />
            <button class="oxygen_offdate_button" :disabled="!newOffDate" @click="addDate">{{ t('oxy_offdays_add') }}</button>
          </div>
          <div v-if="prefs.offDates.length" class="oxygen_offdate_list">
            <span v-for="dt in prefs.offDates" :key="dt" class="oxygen_chip">
              {{ fmtDate(dt) }}
              <button class="oxygen_chip_close" :aria-label="t('oxy_close')" @click="prefs.removeOffDate(dt)">✕</button>
            </span>
          </div>
        </div>
      </div>
    </section>

    <!-- ── Closing (Lot 3b) — global overlay rendered by OxygenPulse ── -->
    <section class="oxygen_card">
      <h2>{{ t('oxy_ferm_title') }}</h2>
      <p v-if="recoveries.todayClosing" class="oxygen_closing_done_line">✓ {{ t('oxy_ferm_already') }}</p>
      <button v-else class="oxygen_closing_launch" @click="recoveries.openClosing('cloture')">
        🫧 {{ t('oxy_ferm_start') }}
      </button>
    </section>

    <!-- ── The Sky (Lot 3b) — one bubble per closed day ── -->
    <section class="oxygen_card">
      <h2>{{ t('oxy_sky_title') }}</h2>
      <p class="oxygen_sky_hint">{{ t('oxy_sky_hint') }}</p>
      <OxygenSky />
    </section>

    <!-- ── Nova + urgent items — kept as-is until Lyo (Lot 5) ── -->
    <WbNovaChat />
    <WbEmergency />
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useAuthStore } from '@/stores/auth'
import { useWellbeingStore } from '@/stores/wellbeing'
import { useOxygenCheckinsStore } from '@/stores/oxygenCheckins'
import { useOxygenDailyStore } from '@/stores/oxygenDaily'
import { useOxygenLoadStore } from '@/stores/oxygenLoad'
import { useOxygenPrefsStore } from '@/stores/oxygenPrefs'
import { useOxygenEngineStore } from '@/stores/oxygenEngine'
import { useOxygenRecoveriesStore } from '@/stores/oxygenRecoveries'
import { localeTag, fmtDate } from '@/lib/formatters'
import OxygenCheckinForm from '@/components/oxygen/OxygenCheckinForm.vue'
import OxygenSky from '@/components/oxygen/OxygenSky.vue'
import WbNovaChat from '@/components/wellbeing/WbNovaChat.vue'
import WbEmergency from '@/components/wellbeing/WbEmergency.vue'
import '@/assets/wellbeing.css'
import '@/assets/oxygen.css'

// ─── OXYGEN Lot 3a — THE SINGLE OXYGEN PAGE (contract R23 approved 28/07/2026) ───
// One scrollable screen: index + formula · load weather · inline check-in
// (component SHARED with the dot — a single write) · streak +
// personal days off · Nova + urgent items (kept until Lyo, Lot 5).
// The page READS — the day's oxygen_daily upsert stays owned by OxygenPulse
// (contractual OXY-IDX-NULL boot order, never duplicated here). The Closing and
// the Sky arrive in Lot 3b (no dead buttons in the meantime).
// "How do you feel" smileys and % sliders: REMOVED (amendment
// 28/07 — a single check-in system, zero duplication, the wellbeing_entries table
// is never written to again; its fate = Lot 5).

const { t } = useI18n({ useScope: 'global' })
const auth = useAuthStore()
const wellbeing = useWellbeingStore()
const checkins = useOxygenCheckinsStore()
const oxygenDaily = useOxygenDailyStore()
const loadStore = useOxygenLoadStore()
const prefs = useOxygenPrefsStore()
const engine = useOxygenEngineStore()
const recoveries = useOxygenRecoveriesStore()

const showHow = ref(false)
const showOffdays = ref(false)
const newOffDate = ref('')

const hasIndex = computed(() => engine.indexToday != null)
const displayIndex = computed(() => (hasIndex.value ? Math.round(engine.indexToday) : '—'))

const streakLine = computed(() => {
  if (engine.streak == null || engine.streak < 2) return t('oxy_streak_none')
  return t('oxy_streak', { n: engine.streakCapped ? '30+' : engine.streak })
})

// Real components of the load (pure oxygenLoad read — R21)
const componentChips = computed(() => ([
  { key: 'critical', value: loadStore.components.critical, label: 'oxy_c_critical' },
  { key: 'renewals30', value: loadStore.components.renewals30, label: 'oxy_c_renewals' },
  { key: 'overdue', value: loadStore.components.overdue_tasks, label: 'oxy_c_overdue' },
  { key: 'alerts7', value: loadStore.components.alerts7, label: 'oxy_c_alerts' },
  { key: 'playbooks', value: loadStore.components.active_playbooks, label: 'oxy_c_playbooks' },
]))

// Day labels localized by Intl (C7 — zero hardcoding, follows the locale;
// localeTag() reads the global i18n ref → the computed recomputes on switch).
// Display order Mon→Sun; d.day = getUTCDay convention (0=Sun).
const weekDays = computed(() => {
  const fmt = new Intl.DateTimeFormat(localeTag(), { weekday: 'short', timeZone: 'UTC' })
  return [1, 2, 3, 4, 5, 6, 0].map(day => ({
    day,
    // 2026-07-05 = a Sunday (UTC) → stable base to derive each day from
    label: fmt.format(new Date(Date.UTC(2026, 6, 5 + day))),
  }))
})

function addDate() {
  if (!newOffDate.value) return
  prefs.addOffDate(newOffDate.value)
  newOffDate.value = ''
}

onMounted(() => {
  // Nova (panel kept from the wellbeing store — history only)
  wellbeing.init()
  if (!auth.user?.id) return
  prefs.loadFor(auth.user.id)
  // Histories: already loaded by the OxygenPulse boot in the nominal case —
  // idempotent guards for landing directly on /app/oxygen. NO upsert here.
  if (!checkins.historyLoaded) checkins.loadHistory30()
  if (!oxygenDaily.historyLoaded) oxygenDaily.loadHistory30()
  if (!recoveries.todayLoaded) recoveries.loadToday()
})
</script>

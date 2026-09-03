<template>
  <div class="oxy-view">
    <!-- ── En-tête : Oxygen + confidentialité (self-only, formule visible) ── -->
    <h1>🫧 Oxygen</h1>
    <div class="oxy-privacy">
      <span>🔒</span>
      <span>{{ t('oxy_privacy') }}</span>
    </div>

    <!-- ── Indice du jour — « — » sans check-in (R21, jamais inventé) ── -->
    <section class="oxy-card oxy-index-card">
      <div class="oxy-index-main">
        <span class="oxy-index-big">{{ displayIndex }}</span>
        <div class="oxy-index-meta">
          <strong>{{ t('oxy_index_label') }}</strong>
          <span v-if="!hasIndex" class="oxy-index-hint">{{ t('oxy_index_none_hint') }}</span>
        </div>
      </div>
      <p v-if="engine.divergenceActive" class="oxy-div">{{ t('oxy_divergence') }}</p>
      <button class="oxy-how" @click="showHow = !showHow">{{ t('oxy_how_title') }}</button>
      <p v-if="showHow" class="oxy-how-body">{{ t('oxy_how_body', { load: loadStore.loadScore }) }}</p>
    </section>

    <!-- ── Météo de charge — composantes réelles uniquement (lecture pure) ── -->
    <section class="oxy-card">
      <h2>{{ t('oxy_weather_title') }}</h2>
      <div class="oxy-weather-line">
        <span class="oxy-load-num">{{ loadStore.loadScore }}</span>
        <span class="oxy-load-label">{{ t('oxy_load_label') }}</span>
      </div>
      <div class="oxy-chips">
        <span v-for="c in componentChips" :key="c.key" class="oxy-chip" :class="{ quiet: !c.value }">
          {{ c.value }} {{ t(c.label) }}
        </span>
      </div>
    </section>

    <!-- ── Check-in du jour — MÊME composant et MÊME écriture que la pastille ── -->
    <section class="oxy-card">
      <h2>{{ t('oxy_checkin_title') }}</h2>
      <OxygenCheckinForm />
    </section>

    <!-- ── Série + jours off personnalisés ── -->
    <section class="oxy-card">
      <h2>{{ t('oxy_series_title') }}</h2>
      <p class="oxy-streak-line">
        {{ streakLine }}
      </p>
      <p class="oxy-pardon-hint">{{ t('oxy_pardon_hint') }}</p>

      <button class="oxy-how" @click="showOffdays = !showOffdays">⚙ {{ t('oxy_offdays_title') }}</button>
      <div v-if="showOffdays" class="oxy-offdays">
        <p class="oxy-offdays-hint">{{ t('oxy_offdays_hint') }}</p>
        <div class="oxy-days-row">
          <button
            v-for="d in weekDays"
            :key="d.day"
            class="oxy-day-toggle"
            :class="{ off: prefs.weeklyOff.includes(d.day) }"
            :aria-pressed="prefs.weeklyOff.includes(d.day)"
            @click="prefs.toggleWeeklyOff(d.day)"
          >
            {{ d.label }}
          </button>
        </div>
        <div class="oxy-offdates">
          <label class="oxy-offdates-label" for="oxy-offdate">{{ t('oxy_offdays_dates_label') }}</label>
          <div class="oxy-offdate-add">
            <input id="oxy-offdate" v-model="newOffDate" type="date" />
            <button class="oxy-offdate-btn" :disabled="!newOffDate" @click="addDate">{{ t('oxy_offdays_add') }}</button>
          </div>
          <div v-if="prefs.offDates.length" class="oxy-offdate-list">
            <span v-for="dt in prefs.offDates" :key="dt" class="oxy-chip">
              {{ fmtDate(dt) }}
              <button class="oxy-chip-x" :aria-label="t('oxy_close')" @click="prefs.removeOffDate(dt)">✕</button>
            </span>
          </div>
        </div>
      </div>
    </section>

    <!-- ── Fermeture (Lot 3b) — overlay global rendu par OxygenPulse ── -->
    <section class="oxy-card">
      <h2>{{ t('oxy_ferm_title') }}</h2>
      <p v-if="recoveries.todayCloture" class="oxy-ferm-done-line">✓ {{ t('oxy_ferm_already') }}</p>
      <button v-else class="oxy-ferm-launch" @click="recoveries.openFermeture('cloture')">
        🫧 {{ t('oxy_ferm_start') }}
      </button>
    </section>

    <!-- ── Le Ciel (Lot 3b) — une bulle par journée fermée ── -->
    <section class="oxy-card">
      <h2>{{ t('oxy_ciel_title') }}</h2>
      <p class="oxy-ciel-hint">{{ t('oxy_ciel_hint') }}</p>
      <OxygenCiel />
    </section>

    <!-- ── Nova + urgences — conservés tels quels jusqu'à Lyo (Lot 5) ── -->
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
import OxygenCiel from '@/components/oxygen/OxygenCiel.vue'
import WbNovaChat from '@/components/wellbeing/WbNovaChat.vue'
import WbEmergency from '@/components/wellbeing/WbEmergency.vue'
import '@/assets/wellbeing.css'
import '@/assets/oxygen.css'

// ─── OXYGEN Lot 3a — LA PAGE OXYGEN UNIQUE (contrat R23 validé 28/07/2026) ───
// Un seul écran scrollable : indice + formule · météo de charge · check-in
// inline (composant PARTAGÉ avec la pastille — une seule écriture) · série +
// jours off perso · Nova + urgences (conservés jusqu'à Lyo, Lot 5).
// La page LIT — l'upsert oxygen_daily du jour reste porté par OxygenPulse
// (ordre boot OXY-IDX-NULL contractuel, jamais dupliqué ici). La Fermeture et
// le Ciel arrivent au Lot 3b (aucun bouton mort en attendant).
// Smileys « comment vous sentez-vous » et curseurs % : SUPPRIMÉS (amendement
// 28/07 — un seul système de check-in, zéro doublon, table wellbeing_entries
// plus jamais écrite ; son sort = Lot 5).

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

// Composantes réelles de la charge (lecture pure oxygenLoad — R21)
const componentChips = computed(() => ([
  { key: 'critical', value: loadStore.components.critical, label: 'oxy_c_critical' },
  { key: 'renewals30', value: loadStore.components.renewals30, label: 'oxy_c_renewals' },
  { key: 'overdue', value: loadStore.components.overdue_tasks, label: 'oxy_c_overdue' },
  { key: 'alerts7', value: loadStore.components.alerts7, label: 'oxy_c_alerts' },
  { key: 'playbooks', value: loadStore.components.active_playbooks, label: 'oxy_c_playbooks' },
]))

// Libellés des jours localisés par Intl (C7 — zéro hardcode, suit la locale ;
// localeTag() lit le ref i18n global → le computed se recalcule au switch).
// Ordre d'affichage lun→dim ; d.day = convention getUTCDay (0=dim).
const weekDays = computed(() => {
  const fmt = new Intl.DateTimeFormat(localeTag(), { weekday: 'short', timeZone: 'UTC' })
  return [1, 2, 3, 4, 5, 6, 0].map(day => ({
    day,
    // 2026-07-05 = un dimanche (UTC) → base stable pour dériver chaque jour
    label: fmt.format(new Date(Date.UTC(2026, 6, 5 + day))),
  }))
})

function addDate() {
  if (!newOffDate.value) return
  prefs.addOffDate(newOffDate.value)
  newOffDate.value = ''
}

onMounted(() => {
  // Nova (volet conservé du store wellbeing — historique seulement)
  wellbeing.init()
  if (!auth.user?.id) return
  prefs.loadFor(auth.user.id)
  // Histories : déjà chargées par le boot OxygenPulse dans le cas nominal —
  // gardes idempotentes pour l'arrivée directe sur /app/oxygen. AUCUN upsert ici.
  if (!checkins.historyLoaded) checkins.loadHistory30()
  if (!oxygenDaily.historyLoaded) oxygenDaily.loadHistory30()
  if (!recoveries.todayLoaded) recoveries.loadToday()
})
</script>

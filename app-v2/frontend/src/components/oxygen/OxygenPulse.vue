<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { onClickOutside } from '@vueuse/core'
import { useAuthStore } from '@/stores/auth'
import { useClientStore } from '@/stores/clients'
import { useTaskStore } from '@/stores/tasks'
import { useNotificationStore } from '@/stores/notifications'
import { usePlaybookStore } from '@/stores/playbooks'
import { useOxygenDailyStore } from '@/stores/oxygenDaily'
import { useOxygenCheckinsStore } from '@/stores/oxygenCheckins'
import { useOxygenLoadStore } from '@/stores/oxygenLoad'
import { useOxygenPrefsStore } from '@/stores/oxygenPrefs'
import { useOxygenEngineStore, isEvening, OXY_MICRO_MAX_PER_DAY } from '@/stores/oxygenEngine'
import { useOxygenRecoveriesStore } from '@/stores/oxygenRecoveries'
import OxygenCheckinForm from '@/components/oxygen/OxygenCheckinForm.vue'
import OxygenClosing from '@/components/oxygen/OxygenClosing.vue'

// ─── OXYGEN Lot 2+3a — Pulse: topbar dot + 10 s check-in ───────────────────
// Absorbs the renderless mount from Lot 1 (OxygenDaily.vue deleted): guarantee
// the sources are loaded → upsert the day's oxygen_daily → load the histories.
// Lot 3a: the form is the SHARED OxygenCheckinForm component (same
// write path as the Oxygen page — a single database row per day).
// P10: 1 click → auto focus on the 1st slider → Enter submits. R21: without a check-in,
// the index is null and renders "—"/CTA — never an invented figure.

const { t } = useI18n({ useScope: 'global' })
const auth = useAuthStore()
const clientStore = useClientStore()
const taskStore = useTaskStore()
const notificationStore = useNotificationStore()
const playbookStore = usePlaybookStore()
const oxygenDaily = useOxygenDailyStore()
const checkins = useOxygenCheckinsStore()
const loadStore = useOxygenLoadStore()
const prefs = useOxygenPrefsStore()
const engine = useOxygenEngineStore()
const recoveries = useOxygenRecoveriesStore()

// ── Boot absorbed from the Lot 1 renderless component (idempotent reads) ──
async function ensureSourcesLoaded() {
  const loads = []
  if (!clientStore.clients.length && !clientStore.loading) loads.push(clientStore.loadClients())
  if (!taskStore.tasks.length && !taskStore.loading) loads.push(taskStore.loadTasks())
  if (!notificationStore.notifications.length) loads.push(notificationStore.loadNotifications())
  if (!playbookStore.playbooks.length) loads.push(playbookStore.loadPlaybooks())
  if (loads.length) await Promise.all(loads)
}

onMounted(async () => {
  try {
    if (!auth.user?.id) return
    prefs.loadFor(auth.user.id) // jours off perso (localStorage, synchrone)
    await ensureSourcesLoaded()
    // CRITICAL ORDER (bug OXY-IDX-NULL, evidence ② 28/07): the histories BEFORE
    // the day's upsert — otherwise engine.indexToday is null at write time
    // and the boot overwrites the already persisted index (class B-10b).
    await Promise.all([checkins.loadHistory30(), oxygenDaily.loadHistory30()])
    await oxygenDaily.upsertToday()
    await recoveries.loadToday() // Lot 3b: the day's closing/micro (light GET)
  } catch (e) {
    console.error('[oxygen] OxygenPulse mount failed:', e.message || e)
  }
})

// ── Local clock (evening state — OXY_EVENING_HOUR, engine constant) ──
const now = ref(new Date())
const clock = setInterval(() => { now.value = new Date() }, 60000)
onUnmounted(() => clearInterval(clock))

// ── Derived states (3 contract states: no check-in / with index / ready to close) ──
const hasIndex = computed(() => engine.indexToday != null)
const displayIndex = computed(() => (hasIndex.value ? Math.round(engine.indexToday) : '—'))
const eveningReady = computed(() => hasIndex.value && isEvening(now.value))
const streakText = computed(() => {
  if (engine.streak == null || engine.streak < 2) return ''
  return t('oxy_streak', { n: engine.streakCapped ? '30+' : engine.streak })
})

// ── Lot 3b — Closing + micro-bubble (dot signal ONLY, contract 29/07) ──
const closingDone = computed(() => !!recoveries.todayClosing)
const microHalo = computed(() =>
  engine.microTriggerActive &&
  recoveries.microCountToday < OXY_MICRO_MAX_PER_DAY &&
  !recoveries.microDismissedToday
)
function startClosing() { open.value = false; recoveries.openClosing('cloture') }
function startMicro() { open.value = false; recoveries.openClosing('micro') }

// ── Popover check-in ──
const rootRef = ref(null)
const open = ref(false)
const showHow = ref(false)
onClickOutside(rootRef, () => { open.value = false })

function toggle() {
  open.value = !open.value
  if (open.value) showHow.value = false
  // The shared form (v-if) mounts on open: prefill + auto focus.
}

function onSaved() {
  setTimeout(() => { open.value = false }, 1200)
}
</script>

<template>
  <div ref="rootRef" class="oxygen_pulse">
    <!-- NEUTRAL dot (decision by Lidia 28/07): NO health data visible in the
         topbar — neither index nor state, identical rendering for everyone all day long.
         The index only appears on a deliberate click, inside the popover. -->
    <button class="oxygen_pill" :class="{ 'oxygen_halo': microHalo }" title="Oxygen" :aria-label="t('oxy_pulse_cta')" @click="toggle">
      <span class="oxygen_icon" aria-hidden="true">🫧</span>
    </button>

    <transition name="fade">
      <div v-if="open" class="oxygen_popover">
        <div class="oxygen_header">
          <strong>{{ t('oxy_checkin_title') }}</strong>
          <button class="oxygen_close" :aria-label="t('oxy_close')" @click="open = false">✕</button>
        </div>

        <OxygenCheckinForm autofocus @saved="onSaved" />

        <div class="oxygen_index_line">
          <span class="oxygen_index_number">{{ displayIndex }}</span>
          <span class="oxygen_index_label">{{ t('oxy_index_label') }}</span>
        </div>

        <p v-if="streakText" class="oxygen_streak">{{ streakText }}</p>
        <p v-if="engine.divergenceActive" class="oxygen_div">{{ t('oxy_divergence') }}</p>
        <div v-if="microHalo" class="oxygen_micro_card">
          <p class="oxygen_micro_prompt">{{ t('oxy_micro_prompt') }}</p>
          <div class="oxygen_micro_actions">
            <button class="oxygen_micro_go" @click="startMicro">{{ t('oxy_micro_go') }}</button>
            <button class="oxygen_micro_later" @click="recoveries.dismissMicroToday()">{{ t('oxy_micro_dismiss') }}</button>
          </div>
        </div>

        <p v-if="closingDone" class="oxygen_evening_note">✓ {{ t('oxy_ferm_done_badge') }}</p>
        <button v-else-if="eveningReady" class="oxygen_evening_button" @click="startClosing">
          🌙 {{ t('oxy_pulse_ready') }}
        </button>

        <button class="oxygen_how" @click="showHow = !showHow">{{ t('oxy_how_title') }}</button>
        <p v-if="showHow" class="oxygen_how_body">{{ t('oxy_how_body', { load: loadStore.loadScore }) }}</p>
      </div>
    </transition>

    <OxygenClosing v-if="recoveries.closingOpen" />
  </div>
</template>

<style scoped>
.oxygen_pulse { position: relative; }

/* ── Pastille ── */
.oxygen_pill { display: flex; align-items: center; padding: 5px 11px; border-radius: 999px; border: 1px solid var(--border); background-color: var(--bg-card); cursor: pointer; transition: background 0.15s; }
.oxygen_pill:hover { background: var(--bg-hover); }
.oxygen_icon { font-size: 0.95rem; line-height: 1; }

/* ── Popover (pattern notif-dropdown) ── */
.oxygen_popover { position: absolute; top: 100%; right: 0; margin-top: 8px; width: 320px; background-color: var(--bg-card); border: 1px solid var(--border); border-radius: var(--radius-md); box-shadow: var(--shadow-lg); z-index: 200; padding: 16px; }
.oxygen_header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }
.oxygen_header strong { font-size: 0.9rem; }
.oxygen_close { background: none; border: none; cursor: pointer; color: var(--text-muted); font-size: 0.85rem; padding: 2px 6px; }
.oxygen_close:hover { color: var(--text); }

.oxygen_index_line { display: flex; align-items: baseline; gap: 8px; margin-top: 12px; }
.oxygen_index_number { font-size: 1.4rem; font-weight: 800; color: var(--purple); }
.oxygen_index_label { font-size: 0.75rem; color: var(--text-muted); }

.oxygen_streak { font-size: 0.75rem; color: var(--text-secondary); margin: 6px 0 0; }
.oxygen_div { font-size: 0.78rem; color: var(--text-secondary); background: var(--purple-bg); border-radius: var(--radius-sm); padding: 8px 10px; margin: 8px 0 0; line-height: 1.45; }
.oxygen_evening_note { font-size: 0.75rem; color: var(--text-muted); margin: 6px 0 0; }

.oxygen_how { background: none; border: none; padding: 0; margin-top: 10px; font-size: 0.72rem; color: var(--text-muted); text-decoration: underline; cursor: pointer; }
.oxygen_how:hover { color: var(--text-secondary); }
.oxygen_how_body { font-size: 0.72rem; color: var(--text-muted); line-height: 1.5; margin: 6px 0 0; }

@media (max-width: 768px) {
  .oxygen_popover { position: fixed; left: 16px; right: 16px; top: calc(var(--topbar-height) + 8px); width: auto; }
}
/* Lot 3b — micro halo: constant accent, NO health data (neutrality) */
.oxygen_pill.oxygen_halo { box-shadow: 0 0 0 3px var(--purple-bg), 0 0 10px 2px rgba(124, 58, 237, 0.3); }

.oxygen_micro_card { background: var(--purple-bg); border-radius: var(--radius-sm); padding: 10px 12px; margin-top: 10px; }
.oxygen_micro_prompt { font-size: 0.8rem; color: var(--text); margin: 0 0 8px; }
.oxygen_micro_actions { display: flex; gap: 8px; }
.oxygen_micro_go { flex: 1; padding: 7px 10px; border: none; border-radius: var(--radius-sm); background: var(--purple); color: #fff; font-size: 0.78rem; font-weight: 600; cursor: pointer; }
.oxygen_micro_later { background: none; border: none; font-size: 0.75rem; color: var(--text-muted); cursor: pointer; }
.oxygen_micro_later:hover { color: var(--text-secondary); }

.oxygen_evening_button { width: 100%; margin-top: 10px; padding: 8px 10px; border: 1px solid var(--purple); border-radius: var(--radius-sm); background: none; color: var(--purple); font-size: 0.8rem; font-weight: 600; cursor: pointer; }
.oxygen_evening_button:hover { background: var(--purple-bg); }

@media (prefers-reduced-motion: reduce) {
  .oxygen_pill { transition: none; }
}
</style>

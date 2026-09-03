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
import OxygenFermeture from '@/components/oxygen/OxygenFermeture.vue'

// ─── OXYGEN Lot 2+3a — Pulse : pastille topbar + check-in 10 s ───────────────
// Absorbe le montage renderless du Lot 1 (OxygenDaily.vue supprimé) : garantir
// les sources chargées → upsert oxygen_daily du jour → charger les histories.
// Lot 3a : le formulaire est le composant PARTAGÉ OxygenCheckinForm (même
// chemin d'écriture que la page Oxygen — une seule ligne base par jour).
// P10 : 1 clic → focus auto 1er curseur → Entrée valide. R21 : sans check-in,
// l'indice est null et rend « — »/CTA — jamais un chiffre inventé.

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

// ── Boot absorbé du renderless Lot 1 (lectures idempotentes) ──
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
    // ORDRE CRITIQUE (bug OXY-IDX-NULL, preuve ② 28/07) : les histories AVANT
    // l'upsert du jour — sinon engine.indexToday est null au moment de l'écriture
    // et le boot écrase l'indice déjà persisté (classe B-10b).
    await Promise.all([checkins.loadHistory30(), oxygenDaily.loadHistory30()])
    await oxygenDaily.upsertToday()
    await recoveries.loadToday() // Lot 3b : clôture/micro du jour (GET léger)
  } catch (e) {
    console.error('[oxygen] OxygenPulse mount failed:', e.message || e)
  }
})

// ── Horloge locale (état soir — OXY_EVENING_HOUR, constante engine) ──
const now = ref(new Date())
const clock = setInterval(() => { now.value = new Date() }, 60000)
onUnmounted(() => clearInterval(clock))

// ── États dérivés (3 états contrat : sans check-in / avec indice / prêt à fermer) ──
const hasIndex = computed(() => engine.indexToday != null)
const displayIndex = computed(() => (hasIndex.value ? Math.round(engine.indexToday) : '—'))
const eveningReady = computed(() => hasIndex.value && isEvening(now.value))
const streakText = computed(() => {
  if (engine.streak == null || engine.streak < 2) return ''
  return t('oxy_streak', { n: engine.streakCapped ? '30+' : engine.streak })
})

// ── Lot 3b — Fermeture + micro-bulle (signal pastille SEUL, contrat 29/07) ──
const clotureDone = computed(() => !!recoveries.todayCloture)
const microHalo = computed(() =>
  engine.microTriggerActive &&
  recoveries.microCountToday < OXY_MICRO_MAX_PER_DAY &&
  !recoveries.microDismissedToday
)
function startCloture() { open.value = false; recoveries.openFermeture('cloture') }
function startMicro() { open.value = false; recoveries.openFermeture('micro') }

// ── Popover check-in ──
const rootRef = ref(null)
const open = ref(false)
const showHow = ref(false)
onClickOutside(rootRef, () => { open.value = false })

function toggle() {
  open.value = !open.value
  if (open.value) showHow.value = false
  // Le formulaire partagé (v-if) se monte à l'ouverture : prefill + focus auto.
}

function onSaved() {
  setTimeout(() => { open.value = false }, 1200)
}
</script>

<template>
  <div ref="rootRef" class="oxy-pulse">
    <!-- Pastille NEUTRE (décision Lidia 28/07) : AUCUNE donnée santé visible en
         topbar — ni indice, ni état, rendu identique pour tous toute la journée.
         L'indice n'apparaît que sur clic volontaire, dans le popover. -->
    <button class="oxy-pill" :class="{ 'oxy-halo': microHalo }" title="Oxygen" :aria-label="t('oxy_pulse_cta')" @click="toggle">
      <span class="oxy-icon" aria-hidden="true">🫧</span>
    </button>

    <transition name="fade">
      <div v-if="open" class="oxy-popover">
        <div class="oxy-head">
          <strong>{{ t('oxy_checkin_title') }}</strong>
          <button class="oxy-close" :aria-label="t('oxy_close')" @click="open = false">✕</button>
        </div>

        <OxygenCheckinForm autofocus @saved="onSaved" />

        <div class="oxy-index-line">
          <span class="oxy-index-num">{{ displayIndex }}</span>
          <span class="oxy-index-label">{{ t('oxy_index_label') }}</span>
        </div>

        <p v-if="streakText" class="oxy-streak">{{ streakText }}</p>
        <p v-if="engine.divergenceActive" class="oxy-div">{{ t('oxy_divergence') }}</p>
        <div v-if="microHalo" class="oxy-micro-card">
          <p class="oxy-micro-prompt">{{ t('oxy_micro_prompt') }}</p>
          <div class="oxy-micro-actions">
            <button class="oxy-micro-go" @click="startMicro">{{ t('oxy_micro_go') }}</button>
            <button class="oxy-micro-later" @click="recoveries.dismissMicroToday()">{{ t('oxy_micro_dismiss') }}</button>
          </div>
        </div>

        <p v-if="clotureDone" class="oxy-evening-note">✓ {{ t('oxy_ferm_done_badge') }}</p>
        <button v-else-if="eveningReady" class="oxy-evening-btn" @click="startCloture">
          🌙 {{ t('oxy_pulse_ready') }}
        </button>

        <button class="oxy-how" @click="showHow = !showHow">{{ t('oxy_how_title') }}</button>
        <p v-if="showHow" class="oxy-how-body">{{ t('oxy_how_body', { load: loadStore.loadScore }) }}</p>
      </div>
    </transition>

    <OxygenFermeture v-if="recoveries.fermetureOpen" />
  </div>
</template>

<style scoped>
.oxy-pulse { position: relative; }

/* ── Pastille ── */
.oxy-pill { display: flex; align-items: center; padding: 5px 11px; border-radius: 999px; border: 1px solid var(--border); background-color: var(--bg-card); cursor: pointer; transition: background 0.15s; }
.oxy-pill:hover { background: var(--bg-hover); }
.oxy-icon { font-size: 0.95rem; line-height: 1; }

/* ── Popover (pattern notif-dropdown) ── */
.oxy-popover { position: absolute; top: 100%; right: 0; margin-top: 8px; width: 320px; background-color: var(--bg-card); border: 1px solid var(--border); border-radius: var(--radius-md); box-shadow: var(--shadow-lg); z-index: 200; padding: 16px; }
.oxy-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }
.oxy-head strong { font-size: 0.9rem; }
.oxy-close { background: none; border: none; cursor: pointer; color: var(--text-muted); font-size: 0.85rem; padding: 2px 6px; }
.oxy-close:hover { color: var(--text); }

.oxy-index-line { display: flex; align-items: baseline; gap: 8px; margin-top: 12px; }
.oxy-index-num { font-size: 1.4rem; font-weight: 800; color: var(--purple); }
.oxy-index-label { font-size: 0.75rem; color: var(--text-muted); }

.oxy-streak { font-size: 0.75rem; color: var(--text-secondary); margin: 6px 0 0; }
.oxy-div { font-size: 0.78rem; color: var(--text-secondary); background: var(--purple-bg); border-radius: var(--radius-sm); padding: 8px 10px; margin: 8px 0 0; line-height: 1.45; }
.oxy-evening-note { font-size: 0.75rem; color: var(--text-muted); margin: 6px 0 0; }

.oxy-how { background: none; border: none; padding: 0; margin-top: 10px; font-size: 0.72rem; color: var(--text-muted); text-decoration: underline; cursor: pointer; }
.oxy-how:hover { color: var(--text-secondary); }
.oxy-how-body { font-size: 0.72rem; color: var(--text-muted); line-height: 1.5; margin: 6px 0 0; }

@media (max-width: 768px) {
  .oxy-popover { position: fixed; left: 16px; right: 16px; top: calc(var(--topbar-height) + 8px); width: auto; }
}
/* Lot 3b — halo micro : accent constant, AUCUNE donnée santé (neutralité) */
.oxy-pill.oxy-halo { box-shadow: 0 0 0 3px var(--purple-bg), 0 0 10px 2px rgba(124, 58, 237, 0.3); }

.oxy-micro-card { background: var(--purple-bg); border-radius: var(--radius-sm); padding: 10px 12px; margin-top: 10px; }
.oxy-micro-prompt { font-size: 0.8rem; color: var(--text); margin: 0 0 8px; }
.oxy-micro-actions { display: flex; gap: 8px; }
.oxy-micro-go { flex: 1; padding: 7px 10px; border: none; border-radius: var(--radius-sm); background: var(--purple); color: #fff; font-size: 0.78rem; font-weight: 600; cursor: pointer; }
.oxy-micro-later { background: none; border: none; font-size: 0.75rem; color: var(--text-muted); cursor: pointer; }
.oxy-micro-later:hover { color: var(--text-secondary); }

.oxy-evening-btn { width: 100%; margin-top: 10px; padding: 8px 10px; border: 1px solid var(--purple); border-radius: var(--radius-sm); background: none; color: var(--purple); font-size: 0.8rem; font-weight: 600; cursor: pointer; }
.oxy-evening-btn:hover { background: var(--purple-bg); }

@media (prefers-reduced-motion: reduce) {
  .oxy-pill { transition: none; }
}
</style>

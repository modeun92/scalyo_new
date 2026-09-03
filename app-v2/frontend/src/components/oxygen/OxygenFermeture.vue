<script setup>
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useAuthStore } from '@/stores/auth'
import { useOxygenCheckinsStore } from '@/stores/oxygenCheckins'
import { useOxygenDailyStore } from '@/stores/oxygenDaily'
import { useOxygenEngineStore } from '@/stores/oxygenEngine'
import { useOxygenRecoveriesStore } from '@/stores/oxygenRecoveries'
import { useQuoteStore } from '@/stores/quotes'
import { setDnd } from '@/lib/toast'
import { bubbleParams } from './cielBubble'
import OxygenCheckinForm from './OxygenCheckinForm.vue'

// ─── OXYGEN Lot 3b — LA FERMETURE (contrat R23 29/07/2026) ───────────────────
// Overlay PLEIN ÉCRAN sans route (décision contrat) : un état, pas une page —
// rien dans l'historique de navigation. Échappable À TOUT INSTANT (Esc, ✕,
// « passer ») : une Fermeture échappée n'écrit RIEN et ne consomme pas le jour.
// Mode 'cloture' : 4 étapes (progrès réels → un mot → respiration 90 s →
// demain est prêt) puis écriture UNIQUE (recoveries.closeToday) et bulle du
// jour. Mode 'micro' : respiration 90 s seule, écriture à la fin seulement.
// DND actif pendant l'overlay : toasts en file + badge cloche masqué (lib/toast).
// Respiration = cyclic sighing (~3 cycles/min) ; prefers-reduced-motion →
// bulle statique, le décompte textuel guide seul. Jamais bloquant, zéro rouge.

const emitClose = () => { recoveries.closeOverlay() }

const { t } = useI18n({ useScope: 'global' })
const auth = useAuthStore()
const checkins = useOxygenCheckinsStore()
const oxygenDaily = useOxygenDailyStore()
const engine = useOxygenEngineStore()
const recoveries = useOxygenRecoveriesStore()
const quoteStore = useQuoteStore()

const isMicro = computed(() => recoveries.fermetureMode === 'micro')

// step (cloture) : 1 progrès · 2 mot · 3 respiration · 4 demain · 5 fermée
// step (micro)   : 3 respiration · 5 terminé
const step = ref(1)
const startedAtMs = ref(0)
const closing = ref(false)
const closeError = ref('')

// ── Un mot (pré-rempli du check-in — MÊME ligne base, jamais un 2e système) ──
const word = ref('')
const hasCheckin = computed(() => !!checkins.todayCheckin)
// BUG OXY-FERM-WORD (tué 29/07, vu au rendu run 1) : après le check-in inline de
// l'étape 2, la bascule vers l'input mot partait d'un ref VIDE — le mot venait
// d'être écrit mais n'était pas repris, et un Continuer l'aurait effacé en base.
// Reprise du mot dès que le check-in du jour apparaît — jamais par-dessus une
// saisie en cours (word non vide).
watch(() => checkins.todayCheckin, (c) => { if (c && !word.value) word.value = c.word || '' })

// ── Respiration 90 s ──
const BREATH_TOTAL = 90
const breathLeft = ref(BREATH_TOTAL)
let breathTimer = null
const reducedMotion = typeof window !== 'undefined' &&
  window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches

// ── Progrès du jour (lecture pure engine + notes self) ──
const progressItems = computed(() => {
  const p = engine.dayProgress
  const items = []
  if (p.tasksDone) items.push({ key: 'oxy_ferm_p_tasks', params: { n: p.tasksDone } })
  if (recoveries.notesCountToday) items.push({ key: 'oxy_ferm_p_notes', params: { n: recoveries.notesCountToday } })
  if (p.quotesCreated) items.push({ key: 'oxy_ferm_p_quotes', params: { n: p.quotesCreated } })
  if (p.clientsAdded) items.push({ key: 'oxy_ferm_p_clients', params: { n: p.clientsAdded } })
  return items
})
const progressCount = computed(() => {
  const p = engine.dayProgress
  return p.tasksDone + recoveries.notesCountToday + p.quotesCreated + p.clientsAdded
})

// ── Bulle du jour (écran final — UNIQUEMENT des valeurs persistées relues) ──
const todayBubble = computed(() => {
  const row = recoveries.todayCloture
  if (!row) return null
  const dailyRow = oxygenDaily.history.find(r => r.date === row.date)
  return bubbleParams({
    userId: auth.user?.id || '',
    date: row.date,
    energy: checkins.todayCheckin?.energy,
    load: dailyRow?.load_score,
    progress: row.progress_count,
  })
})

function startBreath() {
  breathLeft.value = BREATH_TOTAL
  breathTimer = setInterval(() => {
    breathLeft.value -= 1
    if (breathLeft.value <= 0) { clearInterval(breathTimer); breathTimer = null; afterBreath() }
  }, 1000)
}
function stopBreath() { if (breathTimer) { clearInterval(breathTimer); breathTimer = null } }

function afterBreath() {
  if (isMicro.value) finishMicro()
  else step.value = 4
}
function skipBreath() {
  stopBreath()
  if (isMicro.value) emitClose() // micro passée = rien écrit, jamais de culpabilisation
  else step.value = 4
}

async function saveWordIfChanged() {
  const c = checkins.todayCheckin
  if (!c) return // sans check-in, l'étape 2 a affiché le formulaire complet
  const w = (word.value || '').trim().slice(0, 80)
  if (w === (c.word || '')) return
  await checkins.upsertToday({ energy: c.energy, mood: c.mood, feltLoad: c.felt_load, word: w })
}

function next() {
  if (step.value === 1) { step.value = 2; word.value = checkins.todayCheckin?.word || '' }
  else if (step.value === 2) { saveWordIfChanged(); step.value = 3; startBreath() }
  else if (step.value === 4) finishCloture()
}

async function finishCloture() {
  if (closing.value) return
  closing.value = true
  closeError.value = ''
  const durationS = Math.max(1, Math.round((performance.now() - startedAtMs.value) / 1000))
  const res = await recoveries.closeToday({ durationS, progressCount: progressCount.value })
  closing.value = false
  if (res?.success) step.value = 5
  else if (res?.error === 'already_closed') { closeError.value = 'already'; step.value = 5 }
  // autre échec : withWrite a déjà montré le toast (en file DND) — on reste, rien de perdu
}

async function finishMicro() {
  const res = await recoveries.microDone({
    durationS: BREATH_TOTAL,
    triggerSource: engine.microTriggerSource || 'pulse',
  })
  if (res?.success) { step.value = 5; setTimeout(emitClose, 2200) }
  else emitClose()
}

function onKeydown(e) {
  if (e.key === 'Escape') { stopBreath(); emitClose() }
}

onMounted(() => {
  setDnd(true) // DND : toasts en file + cloche masquée — restauré quoi qu'il arrive
  window.addEventListener('keydown', onKeydown)
  startedAtMs.value = performance.now()
  recoveries.loadNotesCountToday()
  if (!recoveries.todayLoaded) recoveries.loadToday()
  if (!quoteStore.quotes.length && !quoteStore.loading) quoteStore.loadQuotes() // lecture seule
  if (isMicro.value) { step.value = 3; startBreath() }
})

onUnmounted(() => {
  stopBreath()
  window.removeEventListener('keydown', onKeydown)
  setDnd(false) // flush de la file — JAMAIS de toast perdu
})
</script>

<template>
  <Teleport to="body">
    <div class="oxy-ferm" role="dialog" aria-modal="true" :aria-label="t('oxy_ferm_title')">
      <button class="oxy-ferm-x" :aria-label="t('oxy_close')" @click="stopBreath(); emitClose()">✕</button>
      <p class="oxy-ferm-esc">{{ t('oxy_ferm_esc_hint') }}</p>

      <!-- ── Étape 1 : progrès réels du jour (zéro saisie) ── -->
      <section v-if="step === 1" class="oxy-ferm-step">
        <span class="oxy-ferm-stepnum">{{ t('oxy_ferm_step', { n: 1 }) }}</span>
        <h2>{{ t('oxy_ferm_progress_title') }}</h2>
        <ul v-if="progressItems.length" class="oxy-ferm-list">
          <li v-for="(it, i) in progressItems" :key="i">{{ t(it.key, it.params) }}</li>
        </ul>
        <p v-else class="oxy-ferm-soft">{{ t('oxy_ferm_progress_none') }}</p>
        <button class="oxy-ferm-btn" @click="next">{{ t('oxy_ferm_next') }}</button>
      </section>

      <!-- ── Étape 2 : un mot (même ligne base que le check-in) ── -->
      <section v-else-if="step === 2" class="oxy-ferm-step">
        <span class="oxy-ferm-stepnum">{{ t('oxy_ferm_step', { n: 2 }) }}</span>
        <h2>{{ t('oxy_ferm_word_title') }}</h2>
        <template v-if="hasCheckin">
          <p class="oxy-ferm-soft">{{ t('oxy_ferm_word_hint') }}</p>
          <input
            v-model="word" class="oxy-ferm-word" type="text" maxlength="80"
            :placeholder="t('oxy_word_placeholder')" :aria-label="t('oxy_word_label')"
            @keydown.enter.prevent="next"
          />
        </template>
        <template v-else>
          <p class="oxy-ferm-soft">{{ t('oxy_ferm_checkin_first') }}</p>
          <div class="oxy-ferm-checkin"><OxygenCheckinForm autofocus /></div>
        </template>
        <button class="oxy-ferm-btn" @click="next">{{ t('oxy_ferm_next') }}</button>
      </section>

      <!-- ── Étape 3 : respiration 90 s — cyclic sighing, jamais bloquante ── -->
      <section v-else-if="step === 3" class="oxy-ferm-step oxy-ferm-breath">
        <span v-if="!isMicro" class="oxy-ferm-stepnum">{{ t('oxy_ferm_step', { n: 3 }) }}</span>
        <h2>{{ t('oxy_ferm_breath_title') }}</h2>
        <div class="oxy-breath-stage">
          <div class="oxy-breath-bubble" :class="{ still: reducedMotion }" aria-hidden="true"></div>
        </div>
        <p class="oxy-ferm-soft">{{ t('oxy_ferm_breath_hint') }}</p>
        <p class="oxy-breath-count" aria-live="polite">{{ breathLeft }}s</p>
        <button class="oxy-ferm-skip" @click="skipBreath">{{ t('oxy_ferm_breath_skip') }}</button>
      </section>

      <!-- ── Étape 4 : demain est prêt (dérivé réel, zéro saisie) ── -->
      <section v-else-if="step === 4" class="oxy-ferm-step">
        <span class="oxy-ferm-stepnum">{{ t('oxy_ferm_step', { n: 4 }) }}</span>
        <h2>{{ t('oxy_ferm_tomorrow_title') }}</h2>
        <ul v-if="engine.tomorrowTop3.length" class="oxy-ferm-list">
          <li v-for="(it, i) in engine.tomorrowTop3" :key="i">{{ t(it.key, it.params) }}</li>
        </ul>
        <p v-else class="oxy-ferm-soft">{{ t('oxy_ferm_tomorrow_none') }}</p>
        <button class="oxy-ferm-btn" :disabled="closing || recoveries.saving" @click="next">
          {{ t('oxy_ferm_finish') }}
        </button>
      </section>

      <!-- ── Écran final ── -->
      <section v-else class="oxy-ferm-step oxy-ferm-done">
        <template v-if="isMicro">
          <h2>{{ t('oxy_micro_done') }}</h2>
        </template>
        <template v-else>
          <h2>{{ closeError === 'already' ? t('oxy_ferm_already') : t('oxy_ferm_done_title') }}</h2>
          <svg v-if="todayBubble" class="oxy-ferm-bubble-svg" viewBox="0 0 80 80" aria-hidden="true">
            <circle
              cx="40" cy="40" :r="todayBubble.r"
              :fill="`hsl(${todayBubble.hue} ${todayBubble.sat}% ${todayBubble.light}%)`"
              :fill-opacity="todayBubble.depth"
            />
            <circle
              cx="40" cy="40" :r="todayBubble.r + 5" fill="none"
              :stroke="`hsl(${todayBubble.hue} ${todayBubble.sat}% ${todayBubble.light}%)`"
              stroke-opacity="0.35"
            />
            <circle
              v-for="(d, i) in todayBubble.dots" :key="i"
              :cx="40 + Math.cos(d.a) * todayBubble.r * d.d"
              :cy="40 + Math.sin(d.a) * todayBubble.r * d.d"
              :r="d.s" fill="#fff" fill-opacity="0.55"
            />
          </svg>
          <p class="oxy-ferm-soft">{{ t('oxy_ferm_done_hint') }}</p>
          <button class="oxy-ferm-btn" @click="emitClose">{{ t('oxy_close') }}</button>
        </template>
      </section>
    </div>
  </Teleport>
</template>

<style scoped>
.oxy-ferm {
  position: fixed; inset: 0; z-index: 9000;
  background: linear-gradient(180deg, var(--bg-card) 0%, var(--purple-bg) 100%);
  display: flex; align-items: center; justify-content: center;
}
.oxy-ferm-x { position: absolute; top: 18px; right: 22px; background: none; border: none; font-size: 1.1rem; color: var(--text-muted); cursor: pointer; padding: 6px; }
.oxy-ferm-x:hover { color: var(--text); }
.oxy-ferm-esc { position: absolute; top: 24px; left: 24px; font-size: 0.72rem; color: var(--text-muted); margin: 0; }

.oxy-ferm-step { max-width: 520px; width: 100%; padding: 0 24px; text-align: center; }
.oxy-ferm-stepnum { display: block; font-size: 0.72rem; letter-spacing: 0.08em; text-transform: uppercase; color: var(--text-muted); margin-bottom: 10px; }
.oxy-ferm-step h2 { font-size: 1.35rem; font-weight: 700; color: var(--text); margin: 0 0 16px; }
.oxy-ferm-soft { font-size: 0.88rem; color: var(--text-secondary); line-height: 1.55; margin: 0 0 18px; }
.oxy-ferm-list { list-style: none; padding: 0; margin: 0 0 20px; }
.oxy-ferm-list li { font-size: 0.95rem; color: var(--text); padding: 8px 0; border-bottom: 1px solid var(--border); }
.oxy-ferm-list li:last-child { border-bottom: none; }

.oxy-ferm-btn { padding: 11px 26px; border: none; border-radius: 999px; background: var(--purple); color: #fff; font-size: 0.9rem; font-weight: 600; cursor: pointer; }
.oxy-ferm-btn:disabled { opacity: 0.6; cursor: default; }
.oxy-ferm-skip { display: block; margin: 14px auto 0; background: none; border: none; font-size: 0.78rem; color: var(--text-muted); text-decoration: underline; cursor: pointer; }
.oxy-ferm-skip:hover { color: var(--text-secondary); }

.oxy-ferm-word { width: 100%; padding: 11px 14px; border: 1px solid var(--border); border-radius: var(--radius-sm); background: var(--bg-card); color: var(--text); font-size: 0.95rem; margin: 0 0 18px; text-align: center; }
.oxy-ferm-word:focus { outline: none; border-color: var(--purple); }
.oxy-ferm-checkin { text-align: left; margin-bottom: 16px; }

/* Respiration — cyclic sighing ~3 cycles/min : 2 inspirations + longue expiration */
.oxy-breath-stage { display: flex; align-items: center; justify-content: center; height: 220px; margin-bottom: 8px; }
.oxy-breath-bubble {
  width: 110px; height: 110px; border-radius: 50%;
  background: radial-gradient(circle at 38% 34%, hsl(225 60% 62% / 0.9), hsl(255 50% 45% / 0.75));
  box-shadow: 0 0 40px 6px hsl(240 55% 55% / 0.35);
  animation: oxy-breathe 20s ease-in-out infinite;
}
.oxy-breath-bubble.still { animation: none; }
@keyframes oxy-breathe {
  0%   { transform: scale(1); }
  14%  { transform: scale(1.32); }   /* 1re inspiration nasale */
  20%  { transform: scale(1.28); }
  30%  { transform: scale(1.5); }    /* 2e inspiration courte */
  100% { transform: scale(1); }      /* longue expiration */
}
.oxy-breath-count { font-size: 1.1rem; font-weight: 700; color: var(--purple); margin: 0; font-variant-numeric: tabular-nums; }

.oxy-ferm-done .oxy-ferm-bubble-svg { width: 130px; height: 130px; margin: 6px auto 14px; display: block; }

@media (prefers-reduced-motion: reduce) {
  .oxy-breath-bubble { animation: none; }
}
</style>

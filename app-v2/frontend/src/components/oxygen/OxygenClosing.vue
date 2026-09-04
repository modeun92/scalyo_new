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
import { bubbleParams } from './skyBubble'
import OxygenCheckinForm from './OxygenCheckinForm.vue'

// ─── OXYGEN Lot 3b — THE CLOSING (contract R23 29/07/2026) ─────────────────
// FULL-SCREEN overlay without a route (contract decision): a state, not a page —
// nothing in the navigation history. Escapable AT ANY MOMENT (Esc, ✕,
// "skip"): an escaped Closing writes NOTHING and does not consume the day.
// 'cloture' mode: 4 steps (real progress → one word → 90 s breathing →
// tomorrow is ready) then a SINGLE write (recoveries.closeToday) and the bubble of
// the day. 'micro' mode: 90 s breathing only, write at the end only.
// DND active during the overlay: toasts queued + bell badge hidden (lib/toast).
// Breathing = cyclic sighing (~3 cycles/min); prefers-reduced-motion →
// static bubble, the text countdown guides on its own. Never blocking, zero red.

const emitClose = () => { recoveries.closeOverlay() }

const { t } = useI18n({ useScope: 'global' })
const auth = useAuthStore()
const checkins = useOxygenCheckinsStore()
const oxygenDaily = useOxygenDailyStore()
const engine = useOxygenEngineStore()
const recoveries = useOxygenRecoveriesStore()
const quoteStore = useQuoteStore()

const isMicro = computed(() => recoveries.closingMode === 'micro')

// step (cloture): 1 progress · 2 word · 3 breathing · 4 tomorrow · 5 closed
// step (micro)  : 3 breathing · 5 done
const step = ref(1)
const startedAtMs = ref(0)
const closing = ref(false)
const closeError = ref('')

// ── One word (pre-filled from the check-in — SAME database row, never a 2nd system) ──
const word = ref('')
const hasCheckin = computed(() => !!checkins.todayCheckin)
// BUG OXY-FERM-WORD (killed 29/07, seen while rendering run 1): after the inline check-in of
// step 2, switching to the word input started from an EMPTY ref — the word had just
// been written but was not picked up, and a Continue would have erased it in the database.
// The word is picked up as soon as the day's check-in appears — never over an
// in-progress edit (word not empty).
watch(() => checkins.todayCheckin, (c) => { if (c && !word.value) word.value = c.word || '' })

// ── Respiration 90 s ──
const BREATH_TOTAL = 90
const breathLeft = ref(BREATH_TOTAL)
let breathTimer = null
const reducedMotion = typeof window !== 'undefined' &&
  window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches

// ── Progress of the day (pure engine read + self notes) ──
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

// ── Bubble of the day (final screen — ONLY persisted values read back) ──
const todayBubble = computed(() => {
  const row = recoveries.todayClosing
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
  if (isMicro.value) emitClose() // micro skipped = nothing written, never any guilt-tripping
  else step.value = 4
}

async function saveWordIfChanged() {
  const c = checkins.todayCheckin
  if (!c) return // without a check-in, step 2 displayed the full form
  const w = (word.value || '').trim().slice(0, 80)
  if (w === (c.word || '')) return
  await checkins.upsertToday({ energy: c.energy, mood: c.mood, feltLoad: c.felt_load, word: w })
}

function next() {
  if (step.value === 1) { step.value = 2; word.value = checkins.todayCheckin?.word || '' }
  else if (step.value === 2) { saveWordIfChanged(); step.value = 3; startBreath() }
  else if (step.value === 4) finishClosing()
}

async function finishClosing() {
  if (closing.value) return
  closing.value = true
  closeError.value = ''
  const durationS = Math.max(1, Math.round((performance.now() - startedAtMs.value) / 1000))
  const res = await recoveries.closeToday({ durationS, progressCount: progressCount.value })
  closing.value = false
  if (res?.success) step.value = 5
  else if (res?.error === 'already_closed') { closeError.value = 'already'; step.value = 5 }
  // other failure: withWrite already showed the toast (queued by DND) — we stay, nothing is lost
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
  setDnd(true) // DND: toasts queued + bell hidden — restored whatever happens
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
  setDnd(false) // flush the queue — NEVER a lost toast
})
</script>

<template>
  <Teleport to="body">
    <div class="oxygen_closing" role="dialog" aria-modal="true" :aria-label="t('oxy_ferm_title')">
      <button class="oxygen_closing_close" :aria-label="t('oxy_close')" @click="stopBreath(); emitClose()">✕</button>
      <p class="oxygen_closing_esc">{{ t('oxy_ferm_esc_hint') }}</p>

      <!-- ── Step 1: real progress of the day (zero input) ── -->
      <section v-if="step === 1" class="oxygen_closing_step">
        <span class="oxygen_closing_stepnum">{{ t('oxy_ferm_step', { n: 1 }) }}</span>
        <h2>{{ t('oxy_ferm_progress_title') }}</h2>
        <ul v-if="progressItems.length" class="oxygen_closing_list">
          <li v-for="(it, i) in progressItems" :key="i">{{ t(it.key, it.params) }}</li>
        </ul>
        <p v-else class="oxygen_closing_soft">{{ t('oxy_ferm_progress_none') }}</p>
        <button class="oxygen_closing_button" @click="next">{{ t('oxy_ferm_next') }}</button>
      </section>

      <!-- ── Step 2: one word (same database row as the check-in) ── -->
      <section v-else-if="step === 2" class="oxygen_closing_step">
        <span class="oxygen_closing_stepnum">{{ t('oxy_ferm_step', { n: 2 }) }}</span>
        <h2>{{ t('oxy_ferm_word_title') }}</h2>
        <template v-if="hasCheckin">
          <p class="oxygen_closing_soft">{{ t('oxy_ferm_word_hint') }}</p>
          <input
            v-model="word" class="oxygen_closing_word" type="text" maxlength="80"
            :placeholder="t('oxy_word_placeholder')" :aria-label="t('oxy_word_label')"
            @keydown.enter.prevent="next"
          />
        </template>
        <template v-else>
          <p class="oxygen_closing_soft">{{ t('oxy_ferm_checkin_first') }}</p>
          <div class="oxygen_closing_checkin"><OxygenCheckinForm autofocus /></div>
        </template>
        <button class="oxygen_closing_button" @click="next">{{ t('oxy_ferm_next') }}</button>
      </section>

      <!-- ── Step 3: 90 s breathing — cyclic sighing, never blocking ── -->
      <section v-else-if="step === 3" class="oxygen_closing_step oxygen_closing_breath">
        <span v-if="!isMicro" class="oxygen_closing_stepnum">{{ t('oxy_ferm_step', { n: 3 }) }}</span>
        <h2>{{ t('oxy_ferm_breath_title') }}</h2>
        <div class="oxygen_breath_stage">
          <div class="oxygen_breath_bubble" :class="{ still: reducedMotion }" aria-hidden="true"></div>
        </div>
        <p class="oxygen_closing_soft">{{ t('oxy_ferm_breath_hint') }}</p>
        <p class="oxygen_breath_count" aria-live="polite">{{ breathLeft }}s</p>
        <button class="oxygen_closing_skip" @click="skipBreath">{{ t('oxy_ferm_breath_skip') }}</button>
      </section>

      <!-- ── Step 4: tomorrow is ready (real derived data, zero input) ── -->
      <section v-else-if="step === 4" class="oxygen_closing_step">
        <span class="oxygen_closing_stepnum">{{ t('oxy_ferm_step', { n: 4 }) }}</span>
        <h2>{{ t('oxy_ferm_tomorrow_title') }}</h2>
        <ul v-if="engine.tomorrowTop3.length" class="oxygen_closing_list">
          <li v-for="(it, i) in engine.tomorrowTop3" :key="i">{{ t(it.key, it.params) }}</li>
        </ul>
        <p v-else class="oxygen_closing_soft">{{ t('oxy_ferm_tomorrow_none') }}</p>
        <button class="oxygen_closing_button" :disabled="closing || recoveries.saving" @click="next">
          {{ t('oxy_ferm_finish') }}
        </button>
      </section>

      <!-- ── Final screen ── -->
      <section v-else class="oxygen_closing_step oxygen_closing_done">
        <template v-if="isMicro">
          <h2>{{ t('oxy_micro_done') }}</h2>
        </template>
        <template v-else>
          <h2>{{ closeError === 'already' ? t('oxy_ferm_already') : t('oxy_ferm_done_title') }}</h2>
          <svg v-if="todayBubble" class="oxygen_closing_bubble_svg" viewBox="0 0 80 80" aria-hidden="true">
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
          <p class="oxygen_closing_soft">{{ t('oxy_ferm_done_hint') }}</p>
          <button class="oxygen_closing_button" @click="emitClose">{{ t('oxy_close') }}</button>
        </template>
      </section>
    </div>
  </Teleport>
</template>

<style scoped>
.oxygen_closing {
  position: fixed; inset: 0; z-index: 9000;
  background: linear-gradient(180deg, var(--bg-card) 0%, var(--purple-bg) 100%);
  display: flex; align-items: center; justify-content: center;
}
.oxygen_closing_close { position: absolute; top: 18px; right: 22px; background: none; border: none; font-size: 1.1rem; color: var(--text-muted); cursor: pointer; padding: 6px; }
.oxygen_closing_close:hover { color: var(--text); }
.oxygen_closing_esc { position: absolute; top: 24px; left: 24px; font-size: 0.72rem; color: var(--text-muted); margin: 0; }

.oxygen_closing_step { max-width: 520px; width: 100%; padding: 0 24px; text-align: center; }
.oxygen_closing_stepnum { display: block; font-size: 0.72rem; letter-spacing: 0.08em; text-transform: uppercase; color: var(--text-muted); margin-bottom: 10px; }
.oxygen_closing_step h2 { font-size: 1.35rem; font-weight: 700; color: var(--text); margin: 0 0 16px; }
.oxygen_closing_soft { font-size: 0.88rem; color: var(--text-secondary); line-height: 1.55; margin: 0 0 18px; }
.oxygen_closing_list { list-style: none; padding: 0; margin: 0 0 20px; }
.oxygen_closing_list li { font-size: 0.95rem; color: var(--text); padding: 8px 0; border-bottom: 1px solid var(--border); }
.oxygen_closing_list li:last-child { border-bottom: none; }

.oxygen_closing_button { padding: 11px 26px; border: none; border-radius: 999px; background: var(--purple); color: #fff; font-size: 0.9rem; font-weight: 600; cursor: pointer; }
.oxygen_closing_button:disabled { opacity: 0.6; cursor: default; }
.oxygen_closing_skip { display: block; margin: 14px auto 0; background: none; border: none; font-size: 0.78rem; color: var(--text-muted); text-decoration: underline; cursor: pointer; }
.oxygen_closing_skip:hover { color: var(--text-secondary); }

.oxygen_closing_word { width: 100%; padding: 11px 14px; border: 1px solid var(--border); border-radius: var(--radius-sm); background: var(--bg-card); color: var(--text); font-size: 0.95rem; margin: 0 0 18px; text-align: center; }
.oxygen_closing_word:focus { outline: none; border-color: var(--purple); }
.oxygen_closing_checkin { text-align: left; margin-bottom: 16px; }

/* Respiration — cyclic sighing ~3 cycles/min : 2 inspirations + longue expiration */
.oxygen_breath_stage { display: flex; align-items: center; justify-content: center; height: 220px; margin-bottom: 8px; }
.oxygen_breath_bubble {
  width: 110px; height: 110px; border-radius: 50%;
  background: radial-gradient(circle at 38% 34%, hsl(225 60% 62% / 0.9), hsl(255 50% 45% / 0.75));
  box-shadow: 0 0 40px 6px hsl(240 55% 55% / 0.35);
  animation: oxy-breathe 20s ease-in-out infinite;
}
.oxygen_breath_bubble.still { animation: none; }
@keyframes oxy-breathe {
  0%   { transform: scale(1); }
  14%  { transform: scale(1.32); }   /* 1re inspiration nasale */
  20%  { transform: scale(1.28); }
  30%  { transform: scale(1.5); }    /* 2e inspiration courte */
  100% { transform: scale(1); }      /* longue expiration */
}
.oxygen_breath_count { font-size: 1.1rem; font-weight: 700; color: var(--purple); margin: 0; font-variant-numeric: tabular-nums; }

.oxygen_closing_done .oxygen_closing_bubble_svg { width: 130px; height: 130px; margin: 6px auto 14px; display: block; }

@media (prefers-reduced-motion: reduce) {
  .oxygen_breath_bubble { animation: none; }
}
</style>

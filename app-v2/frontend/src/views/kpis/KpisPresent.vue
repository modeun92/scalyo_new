<template>
  <div class="kp" :class="{ dark: darkMode }" @keydown="onKey" tabindex="0" ref="rootEl">
    <!-- Slides -->
    <transition :name="slideDirection" mode="out-in">
      <!-- Slide 0: Title -->
      <div v-if="slide === 0" key="s0" class="kp-slide slide-title" :style="{ background: `linear-gradient(135deg, ${copil?.color || '#7c3aed'}, #1e1b4b)` }">
        <div class="st-content">
          <h1 class="st-name">{{ copil?.title }}</h1>
          <p v-if="copil?.clientName" class="st-client">{{ copil.clientName }}</p>
          <p class="st-period">{{ copil?.period }}</p>
          <p v-if="copil?.subtitle" class="st-sub">{{ copil.subtitle }}</p>
        </div>
        <div class="st-footer">Scalyo</div>
      </div>

      <!-- Slides 1..n : un bloc du copil par slide -->
      <div v-else-if="slide >= 1 && slide <= slideBlocks.length" :key="'b' + slide" class="kp-slide slide-block">
        <ErrorBoundary><SlideBlock :block="slideBlocks[slide - 1]" :lang="copil?.lang" /></ErrorBoundary>
      </div>

      <!-- Slide 2: Questions -->
      <div v-else key="s5" class="kp-slide slide-end" :style="{ background: `linear-gradient(135deg, ${copil?.color || '#7c3aed'}, #1e1b4b)` }">
        <h1>{{ t('copil_pres_questions') }}</h1>
        <p>{{ copil?.title }} · {{ copil?.period }}</p>
      </div>
    </transition>

    <!-- Controls bar -->
    <div class="kp-controls" :class="{ hidden: controlsHidden }">
      <button @click="prev" :disabled="slide === 0">‹</button>
      <span class="kp-slide-num">{{ t('copil_pres_slide', { n: slide + 1, total: totalSlides }) }}</span>
      <button @click="next" :disabled="slide >= totalSlides - 1">›</button>
      <div class="kp-ctrl-sep" />
      <button @click="toggleAuto">{{ autoPlay ? t('copil_pres_pause') : t('copil_pres_auto') }}</button>
      <button class="kp-theme-btn" @click="darkMode = !darkMode">{{ darkMode ? '☀' : '🌙' }}</button>
      <button @click="exitPresent">{{ t('copil_pres_exit') }}</button>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, nextTick } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useKpiStore } from '@/stores/kpis'
import SlideBlock from '@/components/kpis/SlideBlock.vue'
import ErrorBoundary from '@/components/ErrorBoundary.vue'
import { presentableBlocks } from '@/utils/copilFormat'

const props = defineProps({ id: String })
const { t } = useI18n({ useScope: 'global' })
const router = useRouter()
const store = useKpiStore()

const rootEl = ref(null)
const slide = ref(0)
// Un slide par bloc visible (les blocs techniques/decoratifs sont exclus)
// + slide titre + slide de fin. Déclaré plus bas (dépend de copil).
const darkMode = ref(true)
const autoPlay = ref(false)
const controlsHidden = ref(false)
const slideDirection = ref('slide-left')
let autoTimer = null
let hideTimer = null

const copil = computed(() => store.getCopil(props.id))
const slideBlocks = computed(() => presentableBlocks(copil.value?.blocks))
const totalSlides = computed(() => slideBlocks.value.length + 2)

function prev() { if (slide.value > 0) { slideDirection.value = 'slide-right'; slide.value-- } }
function next() { if (slide.value < totalSlides.value - 1) { slideDirection.value = 'slide-left'; slide.value++ } }

function onKey(e) {
  if (e.key === 'ArrowRight' || e.key === ' ') { e.preventDefault(); next() }
  else if (e.key === 'ArrowLeft') { e.preventDefault(); prev() }
  else if (e.key === 'Escape') exitPresent()
  resetHideTimer()
}

function toggleAuto() {
  autoPlay.value = !autoPlay.value
  if (autoPlay.value) { autoTimer = setInterval(() => { if (slide.value < totalSlides.value - 1) next(); else { autoPlay.value = false; clearInterval(autoTimer) } }, 8000) }
  else clearInterval(autoTimer)
}

function exitPresent() {
  if (document.fullscreenElement) document.exitFullscreen().catch(() => {})
  router.push('/app/kpis/' + props.id)
}

function resetHideTimer() {
  controlsHidden.value = false
  clearTimeout(hideTimer)
  hideTimer = setTimeout(() => { controlsHidden.value = true }, 4000)
}

onMounted(() => {
  nextTick(() => {
    rootEl.value?.focus()
    rootEl.value?.requestFullscreen?.().catch(() => {})
  })
  resetHideTimer()
  document.addEventListener('mousemove', resetHideTimer)
})
onUnmounted(() => {
  clearInterval(autoTimer)
  clearTimeout(hideTimer)
  document.removeEventListener('mousemove', resetHideTimer)
})
</script>

<style scoped>
.kp { position: fixed; inset: 0; z-index: 9999; background: #0a0a0f; color: #fff; overflow: hidden; outline: none; display: flex; flex-direction: column;
  /* COPIL-LIGHT-BLANK : les slides (SlideBlock) ne lisent QUE ces variables — jamais de blanc en dur */
  --sb-text: #fff; --sb-muted: rgba(255,255,255,0.62); --sb-faint: rgba(255,255,255,0.42);
  --sb-card: rgba(255,255,255,0.06); --sb-line: rgba(255,255,255,0.1); --sb-line-strong: rgba(255,255,255,0.22);
  --sb-accent: #a78bfa; --sb-ok: #34d399; --sb-doing: #60a5fa; }
.kp:not(.dark) { background: var(--bg-card); color: var(--text);
  --sb-text: var(--text); --sb-muted: var(--text-secondary); --sb-faint: var(--text-muted);
  --sb-card: var(--bg); --sb-line: var(--border-light); --sb-line-strong: var(--border);
  --sb-accent: var(--purple); --sb-ok: #059669; --sb-doing: #2563eb; }

/* Slides */
.kp-slide { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 60px 40px; }

/* Transitions */
.slide-left-enter-active, .slide-left-leave-active, .slide-right-enter-active, .slide-right-leave-active { transition: all 0.4s ease; }
.slide-left-enter-from { opacity: 0; transform: translateX(80px); }
.slide-left-leave-to { opacity: 0; transform: translateX(-80px); }
.slide-right-enter-from { opacity: 0; transform: translateX(-80px); }
.slide-right-leave-to { opacity: 0; transform: translateX(80px); }

/* Slide 0: Title */
.slide-title { text-align: center; }
.st-content { animation: fadeUp 1s ease; }
@keyframes fadeUp { from { opacity: 0; transform: translateY(30px); } to { opacity: 1; transform: translateY(0); } }
.st-name { font-size: 3.5rem; font-weight: 900; letter-spacing: -0.02em; margin-bottom: 12px; color: #fff; }
.st-client { font-size: 1.5rem; font-weight: 700; color: rgba(255,255,255,0.85); margin-bottom: 8px; }
.st-period { font-size: 1.2rem; color: rgba(255,255,255,0.6); margin-bottom: 8px; }
.st-sub { font-size: 1rem; color: rgba(255,255,255,0.4); }
.st-footer { position: absolute; bottom: 30px; font-size: 0.8rem; color: rgba(255,255,255,0.2); letter-spacing: 0.1em; }

.sn-sections { display: flex; flex-direction: column; gap: 20px; max-width: 700px; width: 100%; }
.sn-section { padding: 20px 24px; border-radius: 12px; }
.sn-section.green { background: rgba(16,185,129,0.1); }
.sn-section.amber { background: rgba(245,158,11,0.1); }
.sn-section.blue { background: rgba(59,130,246,0.1); }
.sn-section h3 { font-size: 0.9rem; font-weight: 700; margin-bottom: 10px; }
.sn-section ul, .sn-section ol { padding-left: 20px; }
.sn-section li { font-size: 0.9rem; line-height: 1.6; margin-bottom: 4px; }

/* Slide 5: End */
.slide-end { text-align: center; }
.slide-end h1 { font-size: 4rem; font-weight: 900; color: #fff; margin-bottom: 16px; animation: fadeUp 0.8s ease; }
.slide-end p { font-size: 1.1rem; color: rgba(255,255,255,0.4); }

/* Controls */
.kp-controls { position: absolute; bottom: 0; left: 0; right: 0; display: flex; align-items: center; justify-content: center; gap: 8px; padding: 12px 20px; background: rgba(0,0,0,0.5); backdrop-filter: blur(10px); transition: opacity 0.3s, transform 0.3s; z-index: 10; }
.kp:not(.dark) .kp-controls { background: rgba(255,255,255,0.9); border-top: 1px solid #e5e7eb; }
.kp-controls.hidden { opacity: 0; transform: translateY(100%); }
.kp-controls button { background: rgba(255,255,255,0.1); border: 1px solid rgba(255,255,255,0.15); color: #fff; padding: 6px 16px; border-radius: 6px; font-size: 0.82rem; cursor: pointer; transition: all 0.15s; }
.kp:not(.dark) .kp-controls button { background: var(--bg-card); border-color: #e5e7eb; color: #374151; }
.kp-controls button:hover { background: rgba(255,255,255,0.2); }
.kp-controls button:disabled { opacity: 0.3; cursor: not-allowed; }
.kp-slide-num { font-size: 0.78rem; color: rgba(255,255,255,0.5); min-width: 80px; text-align: center; }
.kp:not(.dark) .kp-slide-num { color: #9ca3af; }
.kp-ctrl-sep { width: 1px; height: 20px; background: rgba(255,255,255,0.15); margin: 0 8px; }
.kp-theme-btn { font-size: 1rem; }

</style>

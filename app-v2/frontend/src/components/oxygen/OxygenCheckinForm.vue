<script setup>
import { ref, reactive, nextTick, onMounted, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useOxygenCheckinsStore } from '@/stores/oxygenCheckins'

// ─── OXYGEN Lot 3a — formulaire de check-in PARTAGÉ (contrat R23 28/07) ──────
// UN SEUL composant pour le popover de la pastille ET la page Oxygen : un seul
// chemin d'écriture (checkins.upsertToday), zéro duplication, même ligne base.
// P10 : focus auto 1er curseur (prop autofocus), Entrée valide. Échec : withWrite
// affiche déjà le toast — la saisie reste intacte, jamais de faux succès.

const props = defineProps({
  autofocus: { type: Boolean, default: false },
})
const emit = defineEmits(['saved'])

const { t } = useI18n({ useScope: 'global' })
const checkins = useOxygenCheckinsStore()

const savedFlash = ref(false)
const firstSlider = ref(null)
const form = reactive({ energy: 3, mood: 3, feltLoad: 3, word: '' })
const fields = [
  { key: 'energy', label: 'oxy_energy' },
  { key: 'mood', label: 'oxy_mood' },
  { key: 'feltLoad', label: 'oxy_felt_load' },
]

function prefill() {
  const c = checkins.todayCheckin
  if (!c) { form.energy = 3; form.mood = 3; form.feltLoad = 3; form.word = ''; return }
  form.energy = c.energy; form.mood = c.mood; form.feltLoad = c.felt_load; form.word = c.word || ''
}

async function focusFirst() {
  await nextTick()
  firstSlider.value?.focus()
}

onMounted(async () => {
  prefill()
  if (props.autofocus) await focusFirst()
})

// La page peut monter avant la fin du chargement des histories (boot Pulse) :
// quand le check-in du jour arrive, pré-remplir — jamais pendant une saisie active.
watch(() => checkins.todayCheckin, (c) => { if (c && !savedFlash.value) prefill() })

async function save() {
  if (checkins.saving) return
  const res = await checkins.upsertToday({
    energy: form.energy, mood: form.mood, feltLoad: form.feltLoad, word: form.word,
  })
  if (res?.success) {
    savedFlash.value = true
    setTimeout(() => { savedFlash.value = false }, 1200)
    emit('saved')
  }
  // échec : withWrite a déjà affiché le toast write_failed — saisie intacte
}

defineExpose({ prefill, focusFirst })
</script>

<template>
  <div class="oxy-form" @keydown.enter.prevent="save">
    <div v-for="f in fields" :key="f.key" class="oxy-row">
      <label :for="'oxy-' + f.key">{{ t(f.label) }}</label>
      <div class="oxy-slider">
        <input
          :id="'oxy-' + f.key"
          :ref="el => { if (f.key === 'energy') firstSlider = el }"
          type="range" min="1" max="5" step="1"
          :value="form[f.key]"
          @input="form[f.key] = Number($event.target.value)"
        />
        <span class="oxy-num">{{ form[f.key] }}</span>
      </div>
    </div>

    <input
      v-model="form.word"
      class="oxy-word"
      type="text"
      maxlength="80"
      :placeholder="t('oxy_word_placeholder')"
      :aria-label="t('oxy_word_label')"
    />

    <button class="oxy-save" :disabled="checkins.saving" @click="save">
      {{ savedFlash ? '✓ ' + t('oxy_saved') : t('oxy_save') }}
    </button>
  </div>
</template>

<style scoped>
.oxy-row { margin-bottom: 10px; }
.oxy-row label { display: block; font-size: 0.78rem; color: var(--text-secondary); margin-bottom: 4px; }
.oxy-slider { display: flex; align-items: center; gap: 10px; }
.oxy-slider input[type='range'] { flex: 1; accent-color: var(--purple); }
.oxy-num { width: 16px; text-align: center; font-size: 0.85rem; font-weight: 700; color: var(--purple); }

.oxy-word { width: 100%; padding: 8px 10px; border: 1px solid var(--border); border-radius: var(--radius-sm); background-color: var(--bg-card); color: var(--text); font-size: 0.82rem; margin: 2px 0 10px; }
.oxy-word:focus { outline: none; border-color: var(--purple); }

.oxy-save { width: 100%; padding: 9px; border: none; border-radius: var(--radius-sm); background: var(--purple); color: #fff; font-size: 0.85rem; font-weight: 600; cursor: pointer; transition: opacity 0.15s; }
.oxy-save:disabled { opacity: 0.6; cursor: default; }

@media (prefers-reduced-motion: reduce) {
  .oxy-save { transition: none; }
}
</style>

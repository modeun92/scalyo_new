<script setup>
import { ref, reactive, nextTick, onMounted, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useOxygenCheckinsStore } from '@/stores/oxygenCheckins'

// ─── OXYGEN Lot 3a — SHARED check-in form (contract R23 28/07) ──────
// A SINGLE component for both the dot's popover AND the Oxygen page: one single
// write path (checkins.upsertToday), zero duplication, the same database row.
// P10: auto focus on the 1st slider (autofocus prop), Enter submits. On failure: withWrite
// already shows the toast — the input stays intact, never a false success.

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

// The page may mount before the histories finish loading (Pulse boot):
// when the day's check-in arrives, prefill — never during an active edit.
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
  // failure: withWrite already showed the write_failed toast — input intact
}

defineExpose({ prefill, focusFirst })
</script>

<template>
  <div class="oxygen_form" @keydown.enter.prevent="save">
    <div v-for="f in fields" :key="f.key" class="oxygen_row">
      <label :for="'oxy-' + f.key">{{ t(f.label) }}</label>
      <div class="oxygen_slider">
        <input
          :id="'oxy-' + f.key"
          :ref="el => { if (f.key === 'energy') firstSlider = el }"
          type="range" min="1" max="5" step="1"
          :value="form[f.key]"
          @input="form[f.key] = Number($event.target.value)"
        />
        <span class="oxygen_number">{{ form[f.key] }}</span>
      </div>
    </div>

    <input
      v-model="form.word"
      class="oxygen_word"
      type="text"
      maxlength="80"
      :placeholder="t('oxy_word_placeholder')"
      :aria-label="t('oxy_word_label')"
    />

    <button class="oxygen_save" :disabled="checkins.saving" @click="save">
      {{ savedFlash ? '✓ ' + t('oxy_saved') : t('oxy_save') }}
    </button>
  </div>
</template>

<style scoped>
.oxygen_row { margin-bottom: 10px; }
.oxygen_row label { display: block; font-size: 0.78rem; color: var(--text-secondary); margin-bottom: 4px; }
.oxygen_slider { display: flex; align-items: center; gap: 10px; }
.oxygen_slider input[type='range'] { flex: 1; accent-color: var(--purple); }
.oxygen_number { width: 16px; text-align: center; font-size: 0.85rem; font-weight: 700; color: var(--purple); }

.oxygen_word { width: 100%; padding: 8px 10px; border: 1px solid var(--border); border-radius: var(--radius-sm); background-color: var(--bg-card); color: var(--text); font-size: 0.82rem; margin: 2px 0 10px; }
.oxygen_word:focus { outline: none; border-color: var(--purple); }

.oxygen_save { width: 100%; padding: 9px; border: none; border-radius: var(--radius-sm); background: var(--purple); color: #fff; font-size: 0.85rem; font-weight: 600; cursor: pointer; transition: opacity 0.15s; }
.oxygen_save:disabled { opacity: 0.6; cursor: default; }

@media (prefers-reduced-motion: reduce) {
  .oxygen_save { transition: none; }
}
</style>

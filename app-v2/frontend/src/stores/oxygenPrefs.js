import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

// ─── OXYGEN Lot 3a — jours off personnalisés (contrat R23 validé 28/07/2026) ──
// Persistance v1 : localStorage user-scopé (pattern D-16, jamais la fuite
// cross-comptes D-07) — clé scalyo_oxygen_offdays_<uid>. v2 colonne base = hors
// périmètre (décision contrat). Défaut = sam + dim off (comportement Lot 2
// inchangé tant que l'utilisateur ne règle rien). AUCUN texte ici (t() interdit
// en store — la vue rend les libellés). Convention date UTC (= oxygen_daily).
//
// weeklyOff : jours de semaine non travaillés (0=dim … 6=sam, getUTCDay).
// offDates  : dates précises non travaillées ('YYYY-MM-DD') — fériés, congés.
// Garde : impossible de déclarer les 7 jours off (il faut ≥1 jour travaillé).

const DEFAULT_WEEKLY_OFF = [0, 6]
const keyFor = uid => `scalyo_oxygen_offdays_${uid}`
const isDateStr = s => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s)

export const useOxygenPrefsStore = defineStore('oxygenPrefs', () => {
  const userId = ref(null)
  const weeklyOff = ref([...DEFAULT_WEEKLY_OFF])
  const offDates = ref([])
  const loaded = ref(false)

  function loadFor(uid) {
    if (!uid || (loaded.value && userId.value === uid)) return
    userId.value = uid
    try {
      const raw = localStorage.getItem(keyFor(uid))
      if (raw) {
        const parsed = JSON.parse(raw)
        const weekly = Array.isArray(parsed.weeklyOff)
          ? parsed.weeklyOff.filter(d => Number.isInteger(d) && d >= 0 && d <= 6)
          : DEFAULT_WEEKLY_OFF
        weeklyOff.value = weekly.length < 7 ? [...new Set(weekly)] : [...DEFAULT_WEEKLY_OFF]
        offDates.value = Array.isArray(parsed.offDates) ? parsed.offDates.filter(isDateStr) : []
      } else {
        weeklyOff.value = [...DEFAULT_WEEKLY_OFF]
        offDates.value = []
      }
    } catch (e) {
      console.warn('[oxygen] prefs load failed, défauts appliqués:', e.message || e)
      weeklyOff.value = [...DEFAULT_WEEKLY_OFF]
      offDates.value = []
    }
    loaded.value = true
  }

  function persist() {
    if (!userId.value) return
    try {
      localStorage.setItem(keyFor(userId.value), JSON.stringify({
        weeklyOff: weeklyOff.value, offDates: offDates.value,
      }))
    } catch (e) { console.warn('[oxygen] prefs save failed:', e.message || e) }
  }

  // Toggle d'un jour de semaine — refuse de passer les 7 jours en off
  function toggleWeeklyOff(day) {
    if (!Number.isInteger(day) || day < 0 || day > 6) return
    const i = weeklyOff.value.indexOf(day)
    if (i >= 0) weeklyOff.value.splice(i, 1)
    else {
      if (weeklyOff.value.length >= 6) return // ≥1 jour travaillé obligatoire
      weeklyOff.value.push(day)
    }
    persist()
  }

  function addOffDate(dateStr) {
    if (!isDateStr(dateStr) || offDates.value.includes(dateStr)) return
    offDates.value.push(dateStr)
    offDates.value.sort()
    persist()
  }

  function removeOffDate(dateStr) {
    const i = offDates.value.indexOf(dateStr)
    if (i >= 0) { offDates.value.splice(i, 1); persist() }
  }

  const offDateSet = computed(() => new Set(offDates.value))

  // Prédicat UNIQUE consommé par la série ET la divergence (engine).
  // d = Date ; convention UTC (dstr/getUTCDay), identique à oxygenEngine.
  function isWorkingDay(d) {
    if (weeklyOff.value.includes(d.getUTCDay())) return false
    return !offDateSet.value.has(d.toISOString().slice(0, 10))
  }

  return {
    userId, weeklyOff, offDates, loaded,
    loadFor, toggleWeeklyOff, addOffDate, removeOffDate, isWorkingDay,
  }
})

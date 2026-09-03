import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

// ─── OXYGEN Lot 3a — custom days off (contract R23 approved 28/07/2026) ──
// v1 persistence: user-scoped localStorage (D-16 pattern, never the D-07
// cross-account leak) — key scalyo_oxygen_offdays_<uid>. A v2 database column is out of
// scope (contract decision). Default = Sat + Sun off (Lot 2 behaviour
// unchanged as long as the user configures nothing). NO text here (t() forbidden
// in a store — the view renders the labels). UTC date convention (= oxygen_daily).
//
// weeklyOff: non-working weekdays (0=Sun … 6=Sat, getUTCDay).
// offDates : specific non-working dates ('YYYY-MM-DD') — holidays, leave.
// Guard: it is impossible to declare all 7 days off (at least 1 working day is required).

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
      console.warn('[oxygen] prefs load failed, defaults applied:', e.message || e)
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

  // Toggle a weekday — refuses to switch all 7 days off
  function toggleWeeklyOff(day) {
    if (!Number.isInteger(day) || day < 0 || day > 6) return
    const i = weeklyOff.value.indexOf(day)
    if (i >= 0) weeklyOff.value.splice(i, 1)
    else {
      if (weeklyOff.value.length >= 6) return // ≥ 1 working day is mandatory
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

  // The SINGLE predicate consumed by both the streak AND the divergence (engine).
  // d = Date; UTC convention (dstr/getUTCDay), identical to oxygenEngine.
  function isWorkingDay(d) {
    if (weeklyOff.value.includes(d.getUTCDay())) return false
    return !offDateSet.value.has(d.toISOString().slice(0, 10))
  }

  return {
    userId, weeklyOff, offDates, loaded,
    loadFor, toggleWeeklyOff, addOffDate, removeOffDate, isWorkingDay,
  }
})

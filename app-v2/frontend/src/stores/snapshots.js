import { defineStore } from 'pinia'
import { ref } from 'vue'
import { supabase } from '@/lib/supabase'
import { withWrite } from '@/lib/supabaseWrite'

export const useSnapshotStore = defineStore('snapshots', () => {
  const snapshots = ref([])
  const comparePeriod = ref('30d')

  async function loadSnapshots() {
    try {
      const { data, error } = await supabase.from('snapshots').select('*').order('date', { ascending: false }).limit(91)
      // D-15: no more silently swallowed errors
      if (error) { console.error('snapshots.loadSnapshots failed:', error.message); return }
      if (data) snapshots.value = data
    } catch (e) { console.error('snapshots.loadSnapshots failed:', e.message || e) }
  }

  async function saveSnapshot(kpiValues) {
    try {
      // B-10b: payload normalized the way REST will do it (JSON.stringify drops undefined values)
      // and logged on EVERY call (so at boot too) — the intermittent kpis={} becomes observable.
      const payload = JSON.parse(JSON.stringify(kpiValues ?? {}))
      console.log('[snapshots] saveSnapshot payload:', JSON.stringify(payload))
      if (!Object.keys(payload).length) {
        // B-10b guard: never overwrite a healthy snapshot with {} — we trace and return.
        console.warn('[snapshots] saveSnapshot SKIP: empty payload (undefined values at the source)')
        return
      }
      const today = new Date().toISOString().slice(0, 10)
      const existing = snapshots.value.find(s => s.date === today)
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      if (existing) {
        const { error } = await withWrite(() => supabase.from('snapshots').update({ kpis: payload }).eq('id', existing.id), { label: 'snapshots.saveSnapshot(update)' })
        if (error) { console.error('snapshots.saveSnapshot update failed:', error.message || error); return }
        existing.kpis = { ...payload } // local state updated AFTER a confirmed write (truthful, D-14/D-15 pattern)
      } else {
        const { data, error } = await withWrite(() => supabase.from('snapshots').insert([{ user_id: user.id, date: today, kpis: payload }]).select(), { label: 'snapshots.saveSnapshot(insert)' })
        if (error) { console.error('snapshots.saveSnapshot insert failed:', error.message || error); return }
        if (data && data.length) {
          snapshots.value.unshift(data[0])
          if (snapshots.value.length > 91) {
            const toRemove = snapshots.value.sort((a, b) => b.date.localeCompare(a.date)).slice(91)
            snapshots.value = snapshots.value.slice(0, 91)
            for (const old of toRemove) {
              const { error: delErr } = await supabase.from('snapshots').delete().eq('id', old.id)
              if (delErr) console.error('snapshots.saveSnapshot cleanup failed:', delErr.message || delErr)
            }
          }
        }
      }
    } catch (e) { console.error('snapshots.saveSnapshot failed:', e.message || e) }
  }

  function periodToDays(period) {
    const map = { 'day': 1, '1d': 1, 'week': 7, '7d': 7, 'month': 30, '30d': 30, '90d': 90 }
    return map[period] || 30
  }

  function getSnapshot(period) {
    if (!snapshots.value.length) return null
    const daysBack = periodToDays(period)
    const targetDate = new Date()
    targetDate.setDate(targetDate.getDate() - daysBack)
    const targetStr = targetDate.toISOString().slice(0, 10)
    const sorted = [...snapshots.value].sort((a, b) => b.date.localeCompare(a.date))
    const found = sorted.find(s => s.date <= targetStr)
    return found?.kpis || null
  }

  function calcChange(kpiId, currentValue, period, lowerIsBetter = false) {
    const past = getSnapshot(period)
    if (!past || past[kpiId] === undefined || past[kpiId] === null || past[kpiId] === currentValue) {
      return { value: null, type: 'neutral', hasData: false }
    }
    const diff = currentValue - past[kpiId]
    const pct = past[kpiId] !== 0 ? ((diff / Math.abs(past[kpiId])) * 100).toFixed(1) : null
    const isPositive = lowerIsBetter ? diff < 0 : diff > 0
    const sign = diff > 0 ? '+' : ''
    const displayValue = pct !== null ? `${sign}${pct}%` : `${sign}${diff.toFixed(1)}`
    return { value: displayValue, type: isPositive ? 'up' : lowerIsBetter ? 'down_good' : 'down', hasData: true }
  }

  return { snapshots, comparePeriod, saveSnapshot, getSnapshot, calcChange, loadSnapshots, periodToDays }
}, { persist: false })

import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { supabase } from '@/lib/supabase'
import { withWrite } from '@/lib/supabaseWrite'
import { fetchAllRows } from '@/lib/fetchAllRows'
import { healthStatus } from '@/lib/health'

export const useNotificationStore = defineStore('notifications', () => {
  const notifications = ref([])
  const enrichments = ref({})
  const enriched = ref(false)
  // HOTFIX CAP-1000 : total exact en base (count) + drapeau de troncature (garde-fou MAX_ROWS)
  const totalRows = ref(null)
  const truncated = ref(false)

  const unreadCount = computed(() => notifications.value.filter(n => !n.read).length)

  async function loadNotifications() {
    try {
      // HOTFIX CAP-1000 (NOTIF-1000): full pagination — same fix as
      // clients.loadClients. STABLE sort (created_at desc, id desc: a batch
      // generated at boot shares the same created_at — seen in Lot 3b).
      const { rows, total, truncated: cut } = await fetchAllRows(() =>
        supabase.from('notifications').select('*', { count: 'exact' })
          .order('created_at', { ascending: false }).order('id', { ascending: false })
      )
      const seen = new Set()
      notifications.value = rows.filter(r => !seen.has(r.id) && seen.add(r.id))
      totalRows.value = total
      truncated.value = cut
      if (cut && window.Sentry) window.Sentry.captureMessage(`loadNotifications truncated: ${notifications.value.length}/${total}`)
    } catch (e) { console.error('loadNotifications:', e) }
  }
  async function markRead(id) {
    try {
      const n = notifications.value.find(n => n.id === id)
      if (!n) return
      n.read = true
      const { error } = await withWrite(() => supabase.from('notifications').update({ read: true }).eq('id', id), { label: 'notif.markRead' })
      if (error) console.error('markRead:', error)
    } catch (e) { console.error('markRead:', e) }
  }
  // MARK-1000 (hotfix CAP-1000): NEVER again an unbounded .in('id', …) list —
  // at 1000+ ids the PostgREST URL blows up (silent failure). Writes by SERVER-side
  // FILTER: same scope as the loaded ids (identical RLS, full
  // pagination ⇒ loaded = everything visible).
  async function markAllRead() {
    try {
      if (!notifications.value.some(n => !n.read)) return
      notifications.value.forEach(n => n.read = true)
      const { error } = await withWrite(() => supabase.from('notifications').update({ read: true }).eq('read', false), { label: 'notif.markAllRead' })
      if (error) console.error('markAllRead:', error)
    } catch (e) { console.error('markAllRead:', e) }
  }
  async function markTypeRead(type) {
    try {
      const targets = notifications.value.filter(n => (n.type || 'other') === type && !n.read)
      if (!targets.length) return
      targets.forEach(n => { n.read = true })
      if (type === 'other') {
        // 'other' group = null/empty type: no exact server filter → ids in bounded batches (rare case)
        const ids = targets.map(n => n.id)
        for (let i = 0; i < ids.length; i += 200) {
          const chunk = ids.slice(i, i + 200)
          const { error } = await withWrite(() => supabase.from('notifications').update({ read: true }).in('id', chunk), { label: 'notif.markTypeRead' })
          if (error) { console.error('markTypeRead:', error); return }
        }
        return
      }
      const { error } = await withWrite(() => supabase.from('notifications').update({ read: true }).eq('type', type).eq('read', false), { label: 'notif.markTypeRead' })
      if (error) console.error('markTypeRead:', error)
    } catch (e) { console.error('markTypeRead:', e) }
  }
  async function clearAll() {
    try {
      if (!notifications.value.length) return
      notifications.value = []
      const { error } = await withWrite(() => supabase.from('notifications').delete().not('id', 'is', null), { label: 'notif.clearAll' })
      if (error) console.error('clearAll:', error)
    } catch (e) { console.error('clearAll:', e) }
  }
  async function generateFromData(clients, tasks, teamMembers) {
    // GEN-1000 (hotfix CAP-1000): the dedup read was capped at 1000 by
    // PostgREST → beyond that, addIfNew went blind and regenerated duplicates.
    // Full pagination + FAIL-CLOSED: a failure OR truncation of this read
    // → we generate NOTHING (the old code, on a silent error, started from
    // an empty existing set and duplicated en masse).
    let existing = []
    try {
      const res = await fetchAllRows(() =>
        supabase.from('notifications').select('id, type, target_id', { count: 'exact' }).order('id', { ascending: true })
      )
      if (res.truncated) { console.warn(`[notif] generateFromData: dedup read truncated (${res.rows.length}/${res.total}) — generation skipped`); return }
      existing = res.rows
    } catch (e) { console.error('generateFromData (existing):', e); return }

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const toInsert = []
    const today = new Date()
    // dedup by type|target key (Set — the old double .find was O(n²) at boot)
    const keyOf = n => `${n.type}|${n.target_id ?? ''}`
    const existingKeys = new Set(existing.map(keyOf))

    function addIfNew(notif) {
      const k = keyOf(notif)
      if (existingKeys.has(k)) return
      existingKeys.add(k) // also covers the intra-batch duplicate (formerly inBatch)
      toInsert.push({
        user_id: user.id,
        type: notif.type,
        icon: notif.icon || '',
        // title/body kept as a FR fallback for legacy render paths; the reader-locale
        // render uses `payload` (see src/lib/notifText.js).
        title: notif.title || '',
        body: notif.body || '',
        payload: notif.payload || {},
        target_id: notif.target_id || null,
        route: notif.route || null,
        read: false,
      })
    }

    for (const client of (clients || [])) {
      // NOTIF-PROSPECT (observed 29/07): a prospect NEVER triggers
      // a client alert — churn/nps/renewal make no sense before signing.
      if (client.lifecycle === 'prospect') continue
      // HEALTH-SCALE (25/08): "churn risk" = Critical score on the /10 scale (≤ 3, the threshold
      // from lib/health) — same threshold as Dashboard / Portfolio / Satisfaction, no more local `< 4`.
      // Score alone (status null): the alert talks about the score; a manually entered status is not one.
      if (typeof client.health === 'number' && healthStatus(client.health, null) === 'critical') {
        addIfNew({
          type: 'churn_risk',
          icon: '\u{1F534}',
          title: `Risque churn — ${client.name}`,
          body: `Health score ${client.health}/10. Intervention urgente recommandée.`,
          payload: { name: client.name, health: client.health },
          target_id: client.id,
          route: '/app/portfolio',
        })
      }
      if (client.renewalDate) {
        const renewal = new Date(client.renewalDate)
        if (!isNaN(renewal.getTime())) {
          const daysLeft = Math.round((renewal.getTime() - today.getTime()) / 86400000)
          if (daysLeft >= 0 && daysLeft <= 30) {
            addIfNew({
              type: 'renewal',
              icon: '\u{1F4C5}',
              title: `Renouvellement dans ${daysLeft}j — ${client.name}`,
              body: `Date de renouvellement : ${client.renewalDate}`,
              payload: { name: client.name, days: daysLeft, date: client.renewalDate },
              target_id: client.id,
              route: '/app/portfolio',
            })
          }
        }
      }
      if (typeof client.nps === 'number' && client.nps < 20) {
        addIfNew({
          type: 'nps_drop',
          icon: '\u{1F4C9}',
          title: `NPS bas — ${client.name}`,
          body: `Score NPS : ${client.nps}. En dessous du seuil critique.`,
          payload: { name: client.name, nps: client.nps },
          target_id: client.id,
          route: '/app/satisfaction',
        })
      }
    }

    for (const task of (tasks || [])) {
      if (task.dueDate && task.status !== 'done') {
        const daysLate = Math.round((today.getTime() - new Date(task.dueDate).getTime()) / 86400000)
        if (daysLate > 0) {
          addIfNew({
            type: 'task_overdue',
            icon: '⏰',
            title: `Tâche en retard — ${task.title}`,
            body: `En retard de ${daysLate} jour${daysLate > 1 ? 's' : ''}. Statut : ${task.status}`,
            payload: { title: task.title, days: daysLate, status: task.status },
            target_id: task.id,
            route: '/app/tasks/kanban',
          })
        }
      }
    }

    for (const member of (teamMembers || [])) {
      if (member.wellbeingScore < 55 || member.workload > 85) {
        const reasons = []
        if (member.wellbeingScore < 55) reasons.push(`bien-être ${member.wellbeingScore}/100`)
        if (member.workload > 85) reasons.push(`charge ${member.workload}%`)
        addIfNew({
          type: 'burnout',
          icon: '⚠️',
          title: `Alerte burnout — ${member.name}`,
          body: `${reasons.join(', ')}. Vérification recommandée.`,
          payload: {
            name: member.name,
            wellbeing: member.wellbeingScore < 55 ? member.wellbeingScore : null,
            workload: member.workload > 85 ? member.workload : null,
          },
          target_id: member.id,
          route: '/app/workload',
        })
      }
    }

    // Batch insert new notifications
    if (toInsert.length > 0) {
      const { error } = await withWrite(() => supabase.from('notifications').insert(toInsert), { label: 'notif.generate' })
      if (!error) {
        await loadNotifications()
      } else {
        console.error('Failed to insert notifications:', error)
      }
    }
  }


  return {
    notifications, unreadCount, totalRows, truncated,
    markRead, markAllRead, markTypeRead, clearAll, generateFromData, loadNotifications,
  }
}, { persist: false })

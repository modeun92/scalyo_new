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
      // HOTFIX CAP-1000 (NOTIF-1000) : pagination complète — même fix que
      // clients.loadClients. Tri STABLE (created_at desc, id desc : une vague
      // générée au boot partage le même created_at — vécu Lot 3b).
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
  // MARK-1000 (hotfix CAP-1000) : plus JAMAIS de liste .in('id', …) non bornée —
  // à 1000+ ids l'URL PostgREST explose (échec silencieux). Écritures par FILTRE
  // serveur : même périmètre que les ids chargés (RLS identique, pagination
  // complète ⇒ chargé = tout le visible).
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
        // groupe 'other' = type null/vide : pas de filtre serveur exact → ids par lots bornés (cas rare)
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
    // GEN-1000 (hotfix CAP-1000) : la lecture dédup était capée à 1000 par
    // PostgREST → au-delà, addIfNew devenait aveugle et régénérait des doublons.
    // Pagination complète + FAIL-CLOSED : échec OU troncature de cette lecture
    // → on ne génère RIEN (l'ancien code, sur erreur silencieuse, repartait
    // d'un existant vide et dupliquait en masse).
    let existing = []
    try {
      const res = await fetchAllRows(() =>
        supabase.from('notifications').select('id, type, target_id', { count: 'exact' }).order('id', { ascending: true })
      )
      if (res.truncated) { console.warn(`[notif] generateFromData: dédup tronquée (${res.rows.length}/${res.total}) — génération sautée`); return }
      existing = res.rows
    } catch (e) { console.error('generateFromData (existing):', e); return }

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const toInsert = []
    const today = new Date()
    // dédup par clé type|target (Set — l'ancien double .find était O(n²) au boot)
    const keyOf = n => `${n.type}|${n.target_id ?? ''}`
    const existingKeys = new Set(existing.map(keyOf))

    function addIfNew(notif) {
      const k = keyOf(notif)
      if (existingKeys.has(k)) return
      existingKeys.add(k) // couvre aussi le doublon intra-batch (ex-inBatch)
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
      // NOTIF-PROSPECT (constat 29/07) : un prospect ne déclenche JAMAIS
      // d'alerte client — churn/nps/renouvellement sans sens avant signature.
      if (client.lifecycle === 'prospect') continue
      // HEALTH-SCALE (25/08) : « risque churn » = score Critique sur l'échelle /10 (≤ 3, seuil
      // de lib/health) — même seuil que Dashboard / Portefeuille / Satisfaction, plus de `< 4` local.
      // Score seul (statut null) : l'alerte parle du score, un statut saisi à la main n'en est pas un.
      if (typeof client.health === 'number' && healthStatus(client.health, null) === 'critical') {
        addIfNew({
          type: 'churn_risk',
          icon: '\u{1F534}',
          title: `Risque churn \u2014 ${client.name}`,
          body: `Health score ${client.health}/10. Intervention urgente recommand\u00E9e.`,
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
              title: `Renouvellement dans ${daysLeft}j \u2014 ${client.name}`,
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
          title: `NPS bas \u2014 ${client.name}`,
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
            icon: '\u23F0',
            title: `T\u00E2che en retard \u2014 ${task.title}`,
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
        if (member.wellbeingScore < 55) reasons.push(`bien-\u00EAtre ${member.wellbeingScore}/100`)
        if (member.workload > 85) reasons.push(`charge ${member.workload}%`)
        addIfNew({
          type: 'burnout',
          icon: '\u26A0\uFE0F',
          title: `Alerte burnout \u2014 ${member.name}`,
          body: `${reasons.join(', ')}. V\u00E9rification recommand\u00E9e.`,
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

import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { supabase } from '@/lib/supabase'
import { withWrite } from '@/lib/supabaseWrite'

export const TEMPLATES = [
  {
    id: 'tpl_project', key: 'project_launch', icon: '\u{1F680}', color: '#7c3aed',
    milestones: [
      { titleKey: 'rm_ms_project_1', duration: 7 },
      { titleKey: 'rm_ms_project_2', duration: 14 },
      { titleKey: 'rm_ms_project_3', duration: 30 },
      { titleKey: 'rm_ms_project_4', duration: 7 },
      { titleKey: 'rm_ms_project_5', duration: 30 },
      { titleKey: 'rm_ms_project_6', duration: 14 },
    ],
  },
  {
    id: 'tpl_sales', key: 'sales_cycle', icon: '\u{1F91D}', color: '#10b981',
    milestones: [
      { titleKey: 'rm_ms_sales_1', duration: 7 },
      { titleKey: 'rm_ms_sales_2', duration: 7 },
      { titleKey: 'rm_ms_sales_3', duration: 10 },
      { titleKey: 'rm_ms_sales_4', duration: 14 },
      { titleKey: 'rm_ms_sales_5', duration: 7 },
      { titleKey: 'rm_ms_sales_6', duration: 14 },
    ],
  },
  {
    id: 'tpl_session', key: 'session_launch', icon: '\u{1F3EB}', color: '#3b82f6',
    milestones: [
      { titleKey: 'rm_ms_session_1', duration: 30 },
      { titleKey: 'rm_ms_session_2', duration: 21 },
      { titleKey: 'rm_ms_session_3', duration: 14 },
      { titleKey: 'rm_ms_session_4', duration: 1 },
      { titleKey: 'rm_ms_session_5', duration: 7 },
      { titleKey: 'rm_ms_session_6', duration: 30 },
    ],
  },
  {
    id: 'tpl_deployment', key: 'deployment', icon: '\u{1F4E6}', color: '#f59e0b',
    milestones: [
      { titleKey: 'rm_ms_deploy_1', duration: 7 },
      { titleKey: 'rm_ms_deploy_2', duration: 14 },
      { titleKey: 'rm_ms_deploy_3', duration: 7 },
      { titleKey: 'rm_ms_deploy_4', duration: 3 },
      { titleKey: 'rm_ms_deploy_5', duration: 7 },
      { titleKey: 'rm_ms_deploy_6', duration: 14 },
    ],
  },
  {
    // D-12: the keys × 3 languages exist under rm_ms_renewal_* / rm_ms_quarterly_* —
    // the templates referenced rm_ms_renew_* / rm_ms_quarter_* → raw keys at render time
    id: 'tpl_renewal', key: 'renewal', icon: '\u{1F504}', color: '#ec4899',
    milestones: [
      { titleKey: 'rm_ms_renewal_1', duration: 14 },
      { titleKey: 'rm_ms_renewal_2', duration: 14 },
      { titleKey: 'rm_ms_renewal_3', duration: 21 },
      { titleKey: 'rm_ms_renewal_4', duration: 14 },
      { titleKey: 'rm_ms_renewal_5', duration: 7 },
      { titleKey: 'rm_ms_renewal_6', duration: 14 },
    ],
  },
  {
    id: 'tpl_quarterly', key: 'quarterly_goals', icon: '\u{1F4C8}', color: '#06b6d4',
    milestones: [
      { titleKey: 'rm_ms_quarterly_1', duration: 7 },
      { titleKey: 'rm_ms_quarterly_2', duration: 7 },
      { titleKey: 'rm_ms_quarterly_3', duration: 60 },
      { titleKey: 'rm_ms_quarterly_4', duration: 7 },
      { titleKey: 'rm_ms_quarterly_5', duration: 7 },
      { titleKey: 'rm_ms_quarterly_6', duration: 7 },
    ],
  },
]

// D-12: normalizes the titleKey of roadmaps already persisted with the old names
// (rm_ms_renew_* / rm_ms_quarter_*) — self-healing on the next save, zero migration.
// Already-correct keys do not match (renewal/quarterly ≠ renew_/quarter_).
function fixLegacyKey(k) {
  if (typeof k !== 'string') return k
  return k.replace(/^rm_ms_renew_/, 'rm_ms_renewal_').replace(/^rm_ms_quarter_/, 'rm_ms_quarterly_')
}

export const useRoadmapStore = defineStore('roadmap', () => {
  const roadmaps = ref([])

  const activeRoadmaps = computed(() => roadmaps.value.filter(r => r.status === 'active'))
  const doneRoadmaps = computed(() => roadmaps.value.filter(r => r.status === 'done'))

  const globalProgress = computed(() => {
    const all = roadmaps.value.flatMap(r => r.milestones)
    if (!all.length) return 0
    return Math.round(all.filter(m => m.done).length / all.length * 100)
  })

  async function loadRoadmaps() {
    try {
      const { data, error } = await supabase
        .from('roadmaps')
        .select('*')
        .order('created_at', { ascending: false })
      // D-15: no more silently swallowed errors
      if (error) { console.error('roadmap.loadRoadmaps failed:', error.message); return }
      if (data) roadmaps.value = data.map(r => ({
        ...r,
        milestones: Array.isArray(r.milestones)
          ? r.milestones.map(m => (m && m.titleKey ? { ...m, titleKey: fixLegacyKey(m.titleKey) } : m))
          : [],
      }))
    } catch (e) {
      console.error('roadmap.loadRoadmaps failed:', e.message || e)
    }
  }

  async function createFromTemplate(templateId, customName, startDate) {
    try {
      const tpl = TEMPLATES.find(tpl => tpl.id === templateId)
      if (!tpl) return { error: 'template_not_found' }

      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return { error: 'not_authenticated' }
  
      let currentDate = new Date(startDate || new Date())
      const milestones = tpl.milestones.map((m, i) => {
        const start = currentDate.toISOString().slice(0, 10)
        currentDate = new Date(currentDate.getTime() + m.duration * 86400000)
        const end = currentDate.toISOString().slice(0, 10)
        return {
          id: 'm_' + Date.now() + '_' + i,
          titleKey: m.titleKey,
          startDate: start,
          endDate: end,
          done: false,
          status: 'todo',
          notes: '',
        }
      })
  
      const newRm = {
        user_id: user.id,
        name: customName || tpl.key,
        template_id: tpl.id,
        icon: tpl.icon,
        color: tpl.color,
        status: 'active',
        milestones,
      }
  
      const { error } = await withWrite(() => supabase.from('roadmaps').insert([newRm]), { label: 'roadmap.createFromTemplate' })
      if (error) return { error: error.message }
      await loadRoadmaps()
      return { success: true }
    } catch (e) {
      console.error('roadmap.createFromTemplate failed:', e.message || e)
      return { error: 'unexpected' }
    }
  }

  async function createBlank(name, icon, color) {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return { error: 'not_authenticated' }

      const newRm = {
        user_id: user.id,
        name,
        template_id: null,
        icon: icon || '\u{1F4CC}',
        color: color || '#7c3aed',
        status: 'active',
        milestones: [],
      }
  
      const { error } = await withWrite(() => supabase.from('roadmaps').insert([newRm]), { label: 'roadmap.createBlank' })
      if (error) return { error: error.message }
      await loadRoadmaps()
      return { success: true }
    } catch (e) {
      console.error('roadmap.createBlank failed:', e.message || e)
      return { error: 'unexpected' }
    }
  }

  // D-15: optimistic mutations are ALWAYS reverted if the write fails
  // (withWrite = G9-13 timeout + visible error toast), returns {success}/{error}.
  async function addMilestone(roadmapId, milestone) {
    const rm = roadmaps.value.find(r => r.id === roadmapId)
    if (!rm) return { error: 'not_found' }
    const prev = rm.milestones
    rm.milestones = [...rm.milestones, { id: 'm_' + Date.now(), done: false, status: 'todo', notes: '', ...milestone }]
    const { error } = await withWrite(() => supabase.from('roadmaps').update({ milestones: rm.milestones }).eq('id', roadmapId), { label: 'roadmap.addMilestone' })
    if (error) { rm.milestones = prev; return { error: error.message } }
    return { success: true }
  }

  async function updateMilestone(roadmapId, milestoneId, data) {
    const rm = roadmaps.value.find(r => r.id === roadmapId)
    if (!rm) return { error: 'not_found' }
    const mi = rm.milestones.findIndex(m => m.id === milestoneId)
    if (mi === -1) return { error: 'not_found' }
    const prev = JSON.parse(JSON.stringify(rm.milestones[mi]))
    Object.assign(rm.milestones[mi], data)
    const { error } = await withWrite(() => supabase.from('roadmaps').update({ milestones: rm.milestones }).eq('id', roadmapId), { label: 'roadmap.updateMilestone' })
    if (error) { rm.milestones[mi] = prev; return { error: error.message } }
    return { success: true }
  }

  async function deleteMilestone(roadmapId, milestoneId) {
    const rm = roadmaps.value.find(r => r.id === roadmapId)
    if (!rm) return { error: 'not_found' }
    const prev = rm.milestones
    rm.milestones = rm.milestones.filter(m => m.id !== milestoneId)
    const { error } = await withWrite(() => supabase.from('roadmaps').update({ milestones: rm.milestones }).eq('id', roadmapId), { label: 'roadmap.deleteMilestone' })
    if (error) { rm.milestones = prev; return { error: error.message } }
    return { success: true }
  }

  async function updateRoadmap(id, data) {
    const i = roadmaps.value.findIndex(r => r.id === id)
    if (i === -1) return { error: 'not_found' }
    const prev = JSON.parse(JSON.stringify(roadmaps.value[i]))
    Object.assign(roadmaps.value[i], data)
    const { error } = await withWrite(() => supabase.from('roadmaps').update(data).eq('id', id), { label: 'roadmap.updateRoadmap' })
    if (error) { roadmaps.value[i] = prev; return { error: error.message } }
    return { success: true }
  }

  async function deleteRoadmap(id) {
    const prev = roadmaps.value
    roadmaps.value = roadmaps.value.filter(r => r.id !== id)
    const { error } = await withWrite(() => supabase.from('roadmaps').delete().eq('id', id), { label: 'roadmap.deleteRoadmap' })
    if (error) { roadmaps.value = prev; return { error: error.message } }
    return { success: true }
  }

  function roadmapProgress(rm) {
    if (!rm.milestones.length) return 0
    return Math.round(rm.milestones.filter(m => m.done).length / rm.milestones.length * 100)
  }

  return {
    roadmaps, activeRoadmaps, doneRoadmaps, globalProgress,
    createFromTemplate, createBlank,
    addMilestone, updateMilestone, deleteMilestone,
    updateRoadmap, deleteRoadmap, roadmapProgress, loadRoadmaps,
  }
})

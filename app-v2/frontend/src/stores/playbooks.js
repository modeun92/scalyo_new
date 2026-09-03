import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { supabase } from '@/lib/supabase'
import { withWrite } from '@/lib/supabaseWrite'
import { useTaskStore } from '@/stores/tasks'

// Refonte 21/07 (feedback Lidia : « les actions doivent donner de vrais résultats ») :
// 1) Chaque step = action concrète + timing embarqué dans le libellé + critère de sortie.
//    `day` = échéance en jours après activation ; u/i = urgence/importance (Smart Matrice)
//    de la tâche générée.
// 2) À l'activation, chaque step devient une VRAIE tâche datée liée au client — visible
//    dans Kanban / Planning / Priorités, là où le travail se fait. Cocher un step
//    synchronise la tâche liée (sens playbook → tâche uniquement, v1 assumée).
// 3) dbToPb : mapping snake_case → camelCase. Corrige le bug existant : PbCard lisait
//    templateKey/startedAt/clientId sur des lignes Supabase BRUTES → toutes les cartes
//    affichaient « Playbook personnalisé » (pb_template_undefined), date « — », pas de
//    client, recherche cassée.
// Règle C2/C6 respectée : les libellés localisés des tâches viennent de la VUE
// (stepTitles), jamais de t() dans un store.

const TEMPLATES = [
  {
    id: 'tpl_onboard', key: 'onboarding', icon: '\u{1F680}', color: '#3b82f6',
    minPlan: 'growth', auto: false, avgDays: 90,
    steps: [
      { key: 'pb_step_onboarding_1', day: 0, u: 5, i: 5 },
      { key: 'pb_step_onboarding_2', day: 2, u: 4, i: 5 },
      { key: 'pb_step_onboarding_3', day: 7, u: 4, i: 5 },
      { key: 'pb_step_onboarding_4', day: 15, u: 3, i: 4 },
      { key: 'pb_step_onboarding_5', day: 30, u: 3, i: 5 },
      { key: 'pb_step_onboarding_6', day: 60, u: 2, i: 4 },
      { key: 'pb_step_onboarding_7', day: 90, u: 3, i: 5 },
    ],
  },
  {
    id: 'tpl_retention', key: 'retention', icon: '\u{1F6E1}️', color: '#ef4444',
    minPlan: 'growth', auto: false, avgDays: 21,
    steps: [
      { key: 'pb_step_retention_1', day: 0, u: 5, i: 5 },
      { key: 'pb_step_retention_2', day: 0, u: 5, i: 5 },
      { key: 'pb_step_retention_3', day: 2, u: 4, i: 5 },
      { key: 'pb_step_retention_4', day: 7, u: 4, i: 5 },
      { key: 'pb_step_retention_5', day: 14, u: 4, i: 5 },
      { key: 'pb_step_retention_6', day: 21, u: 3, i: 4 },
    ],
  },
  {
    id: 'tpl_expansion', key: 'expansion', icon: '\u{1F4C8}', color: '#10b981',
    minPlan: 'growth', auto: false, avgDays: 30,
    steps: [
      { key: 'pb_step_expansion_1', day: 0, u: 3, i: 4 },
      { key: 'pb_step_expansion_2', day: 3, u: 3, i: 4 },
      { key: 'pb_step_expansion_3', day: 7, u: 3, i: 5 },
      { key: 'pb_step_expansion_4', day: 14, u: 4, i: 5 },
      { key: 'pb_step_expansion_5', day: 21, u: 4, i: 4 },
      { key: 'pb_step_expansion_6', day: 30, u: 4, i: 5 },
    ],
  },
  {
    id: 'tpl_qbr', key: 'qbr', icon: '\u{1F4CA}', color: '#7c3aed',
    minPlan: 'growth', auto: false, avgDays: 14,
    steps: [
      { key: 'pb_step_qbr_1', day: 0, u: 3, i: 4 },
      { key: 'pb_step_qbr_2', day: 3, u: 3, i: 4 },
      { key: 'pb_step_qbr_3', day: 5, u: 3, i: 4 },
      { key: 'pb_step_qbr_4', day: 10, u: 4, i: 5 },
      { key: 'pb_step_qbr_5', day: 12, u: 4, i: 4 },
      { key: 'pb_step_qbr_6', day: 14, u: 3, i: 4 },
    ],
  },
  {
    id: 'tpl_renewal', key: 'renewal', icon: '\u{1F504}', color: '#f59e0b',
    minPlan: 'growth', auto: false, avgDays: 90,
    steps: [
      { key: 'pb_step_renewal_1', day: 0, u: 4, i: 5 },
      { key: 'pb_step_renewal_2', day: 15, u: 5, i: 5 },
      { key: 'pb_step_renewal_3', day: 30, u: 3, i: 5 },
      { key: 'pb_step_renewal_4', day: 45, u: 4, i: 5 },
      { key: 'pb_step_renewal_5', day: 60, u: 4, i: 5 },
      { key: 'pb_step_renewal_6', day: 75, u: 5, i: 5 },
      { key: 'pb_step_renewal_7', day: 83, u: 5, i: 5 },
    ],
  },
  {
    id: 'tpl_nps', key: 'nps', icon: '⭐', color: '#ec4899',
    minPlan: 'growth', auto: false, avgDays: 14,
    steps: [
      { key: 'pb_step_nps_1', day: 0, u: 3, i: 4 },
      { key: 'pb_step_nps_2', day: 3, u: 2, i: 3 },
      { key: 'pb_step_nps_3', day: 5, u: 5, i: 5 },
      { key: 'pb_step_nps_4', day: 7, u: 3, i: 4 },
      { key: 'pb_step_nps_5', day: 10, u: 3, i: 4 },
      { key: 'pb_step_nps_6', day: 14, u: 3, i: 4 },
    ],
  },
]

const PLAN_RANK = { starter: 0, growth: 1, elite: 2, enterprise: 3 } // CR-2 : enterprise etait absent -> rank -1 -> zero template (contrat gating 8/07)

export const usePlaybookStore = defineStore('playbooks', () => {
  const playbooks = ref([])
  const templates = TEMPLATES

  // App-shape camelCase (aligné sur PbCard/PlaybooksView/ClientModal) ;
  // steps = jsonb tel quel ({id, title(clé i18n), done, due?, task_id?}).
  function dbToPb(r) {
    return {
      id: r.id,
      templateId: r.template_id || '',
      templateKey: r.template_key || '',
      icon: r.icon || '',
      color: r.color || '#3b82f6',
      clientId: r.client_id || '',
      csmId: r.csm_id || '',
      status: r.status || 'active',
      steps: Array.isArray(r.steps) ? r.steps : [],
      startedAt: r.started_at || '',
      completedAt: r.completed_at || null,
    }
  }

  const activePlaybooks = computed(() => playbooks.value.filter(p => p.status === 'active'))
  const donePlaybooks = computed(() => playbooks.value.filter(p => p.status === 'done'))

  const doneThisMonth = computed(() => {
    const now = new Date()
    const start = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10)
    return donePlaybooks.value.filter(p => p.completedAt >= start).length
  })

  const avgDuration = computed(() => {
    const done = donePlaybooks.value.filter(p => p.completedAt && p.startedAt)
    if (!done.length) return 0
    const total = done.reduce((s, p) => {
      return s + (new Date(p.completedAt).getTime() - new Date(p.startedAt).getTime())
    }, 0)
    return Math.round(total / done.length / 86400000)
  })

  const successRate = computed(() => {
    const total = playbooks.value.length
    if (!total) return 0
    return Math.round((donePlaybooks.value.length / total) * 100)
  })

  function templatesForPlan(currentPlan) {
    const rank = PLAN_RANK[currentPlan] ?? -1
    return templates.filter(t => rank >= (PLAN_RANK[t.minPlan] ?? 0))
  }

  function canActivate(currentPlan, templateId) {
    const tpl = templates.find(t => t.id === templateId)
    if (!tpl) return false
    const rank = PLAN_RANK[currentPlan] ?? -1
    return rank >= (PLAN_RANK[tpl.minPlan] ?? 0)
  }

  async function loadPlaybooks() {
    try {
      const { data, error } = await supabase
        .from('playbooks')
        .select('*')
        .order('created_at', { ascending: false })
      // D-15 : plus d'erreur avalée en silence
      if (error) { console.error('playbooks.loadPlaybooks failed:', error.message); return }
      if (data) playbooks.value = data.map(dbToPb)
    } catch (e) {
      console.error('playbooks.loadPlaybooks failed:', e.message || e)
    }
  }

  // stepTitles / stepGuides = { clé i18n → texte localisé } fournis par la vue.
  // Chaque step génère une tâche réelle datée (due = activation + day), liée au client ;
  // le GUIDE du step (Objectif/Méthode/Piège/Sortie) part dans la description de la
  // tâche — le CSM a le mode d'emploi là où il travaille.
  async function activateTemplate(templateId, clientId, csmId, currentPlan, stepTitles, stepGuides) {
    try {
      const tpl = templates.find(t => t.id === templateId)
      if (!tpl) return { error: 'template_not_found' }

      if (!canActivate(currentPlan, templateId)) {
        return { error: 'plan_insufficient' }
      }

      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return { error: 'not_authenticated' }

      // 1) Les tâches d'abord ; si l'insert du playbook échoue ensuite, rollback
      //    des tâches créées (pas d'orphelines silencieuses).
      const tasksStore = useTaskStore()
      const createdTaskIds = []
      const steps = []
      const startMs = Date.now()
      for (let i = 0; i < tpl.steps.length; i++) {
        const s = tpl.steps[i]
        const due = new Date(startMs + (s.day || 0) * 86400000).toISOString().slice(0, 10)
        let taskId = null
        const title = stepTitles ? stepTitles[s.key] : ''
        if (title) {
          const created = await tasksStore.addTask({
            title,
            description: (stepGuides && stepGuides[s.key]) || '',
            clientId: clientId || '',
            status: 'todo',
            dueDate: due,
            endDate: due,
            urgency: s.u ?? 3,
            importance: s.i ?? 4,
            tags: ['playbook'],
          })
          if (created) { taskId = created.id; createdTaskIds.push(created.id) }
        }
        steps.push({ id: i, title: s.key, done: false, due, task_id: taskId })
      }

      const newPb = {
        user_id: user.id,
        template_id: tpl.id,
        template_key: tpl.key,
        icon: tpl.icon,
        color: tpl.color,
        client_id: clientId || null,
        csm_id: csmId || null,
        status: 'active',
        steps,
        started_at: new Date(startMs).toISOString().slice(0, 10),
        completed_at: null,
      }

      const { error } = await withWrite(() => supabase.from('playbooks').insert([newPb]), { label: 'playbooks.activateTemplate' })
      if (error) {
        for (const id of createdTaskIds) await tasksStore.deleteTask(id)
        return { error: error.message }
      }
      await loadPlaybooks()
      return { success: true }
    } catch (e) {
      console.error('playbooks.activateTemplate failed:', e.message || e)
      return { error: 'unexpected' }
    }
  }

  // D-15 : mutations optimistes TOUJOURS revertées si l'écriture échoue
  // (withWrite = timeout G9-13 + toast d'erreur visible), retour {success}/{error}.
  async function toggleStep(playbookId, stepId) {
    const pb = playbooks.value.find(p => p.id === playbookId)
    if (!pb) return { error: 'not_found' }
    const step = pb.steps.find(s => s.id === stepId)
    if (!step) return { error: 'not_found' }
    step.done = !step.done
    const { error } = await withWrite(() => supabase.from('playbooks').update({ steps: pb.steps }).eq('id', playbookId), { label: 'playbooks.toggleStep' })
    if (error) { step.done = !step.done; return { error: error.message } }
    // Sync playbook → tâche liée (échec non bloquant : withWrite de tasks toaste déjà)
    if (step.task_id) {
      const tasksStore = useTaskStore()
      await tasksStore.updateTask(step.task_id, { status: step.done ? 'done' : 'todo', finished: step.done })
    }
    return { success: true }
  }

  async function completePlaybook(playbookId) {
    const pb = playbooks.value.find(p => p.id === playbookId)
    if (!pb) return { error: 'not_found' }
    const prev = { status: pb.status, completedAt: pb.completedAt, steps: JSON.parse(JSON.stringify(pb.steps)) }
    pb.status = 'done'
    pb.completedAt = new Date().toISOString().slice(0, 10)
    pb.steps.forEach(s => s.done = true)
    // D-15 : updErr était destructuré mais JAMAIS testé — faux « terminé » silencieux
    const { error } = await withWrite(() => supabase.from('playbooks').update({
      status: 'done',
      completed_at: pb.completedAt,
      steps: pb.steps,
    }).eq('id', playbookId), { label: 'playbooks.completePlaybook' })
    if (error) { pb.status = prev.status; pb.completedAt = prev.completedAt; pb.steps = prev.steps; return { error: error.message } }
    // Les tâches liées suivent (terminées avec le playbook)
    const tasksStore = useTaskStore()
    for (const s of pb.steps) {
      if (s.task_id) await tasksStore.updateTask(s.task_id, { status: 'done', finished: true })
    }
    return { success: true }
  }

  async function deletePlaybook(playbookId) {
    const pb = playbooks.value.find(p => p.id === playbookId)
    const prev = playbooks.value
    playbooks.value = playbooks.value.filter(p => p.id !== playbookId)
    const { error } = await withWrite(() => supabase.from('playbooks').delete().eq('id', playbookId), { label: 'playbooks.deletePlaybook' })
    if (error) { playbooks.value = prev; return { error: error.message } }
    // Plan abandonné → ses tâches NON faites partent aussi ; les faites restent (historique réel)
    if (pb) {
      const tasksStore = useTaskStore()
      for (const s of pb.steps) {
        if (s.task_id && !s.done) await tasksStore.deleteTask(s.task_id)
      }
    }
    return { success: true }
  }

  return {
    playbooks, templates,
    activePlaybooks, donePlaybooks, doneThisMonth,
    avgDuration, successRate,
    templatesForPlan, canActivate,
    activateTemplate, toggleStep, completePlaybook, deletePlaybook, loadPlaybooks,
  }
}, { persist: false })

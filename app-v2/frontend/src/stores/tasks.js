import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { supabase } from '@/lib/supabase'
import { withWrite } from '@/lib/supabaseWrite'

async function getCurrentUserId() {
  try {
    const { data: { user } } = await supabase.auth.getUser()
    return user?.id
  } catch (err) {
    if (window.Sentry) window.Sentry.captureException(err)
    return null
  }
}

export const useTaskStore = defineStore('tasks', () => {
  const tasks = ref([])
  const projects = ref([])
  const loading = ref(false)
  const lastError = ref(null)

  // ── Computed ──
  const tasksByStatus = computed(() => ({
    todo: tasks.value.filter(t => t.status === 'todo'),
    in_progress: tasks.value.filter(t => t.status === 'in_progress'),
    blocked: tasks.value.filter(t => t.status === 'blocked'),
    done: tasks.value.filter(t => t.status === 'done'),
  }))

  // Lot KPIs auto (contrat 22/07, R21) : % de tâches terminées (done|finished) sur
  // l'ensemble des tâches chargées. 0 tâche → null (« — » au dashboard).
  const completionRate = computed(() => {
    const total = tasks.value.length
    if (!total) return null
    const done = tasks.value.filter(t => t.finished || t.status === 'done').length
    return parseFloat(((done / total) * 100).toFixed(1))
  })

  const urgentTasks = computed(() =>
    tasks.value.filter(t => (t.urgency >= 4 || t.importance >= 4) && t.status !== 'done')
  )

  const overdueTasks = computed(() => {
    const today = new Date().toISOString().slice(0, 10)
    return tasks.value.filter(t => t.endDate && t.endDate < today && t.status !== 'done' && !t.finished)
  })

  // ── AI Predictions ──
  const predictions = computed(() => {
    const allTasks = tasks.value.filter(t => t.taskType !== 'project')
    const doneTasks = allTasks.filter(t => t.finished || t.status === 'done')
    const totalTasks = allTasks.length
    const doneCount = doneTasks.length

    // STATS-N1 (29/08) : < 3 tâches terminées = aucune base de prédiction. L'ancien code
    // inventait 0,5 tâche/sem à partir de RIEN et extrapolait une date de fin dès 1 tâche —
    // vélocité, semaines restantes et date sortent null (R21 : null = pas de donnée, la vue
    // affiche l'état « pas assez de données »). Les composantes RÉELLES (bloquées, en retard,
    // % complétion) restent calculées et affichées.
    const insufficientData = doneCount < 3

    // Velocity: tasks done per week (based on last 30 days)
    const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10)
    const recentDone = doneTasks.filter(t => t.updatedAt && t.updatedAt >= thirtyDaysAgo)
    const velocityPerWeek = recentDone.length > 0 ? (recentDone.length / 4.3) : (doneCount > 0 ? doneCount / 12 : 0.5)

    // Remaining tasks
    const remaining = totalTasks - doneCount
    const weeksToComplete = velocityPerWeek > 0 ? Math.ceil(remaining / velocityPerWeek) : null

    // Estimated completion date
    const estimatedDate = weeksToComplete
      ? new Date(Date.now() + weeksToComplete * 7 * 86400000).toISOString().slice(0, 10)
      : null

    // Hours analysis
    const totalActual = allTasks.reduce((s, t) => s + (t.actualHours || 0), 0)
    const totalExpected = allTasks.reduce((s, t) => s + (t.expectedHours || 0), 0)
    const totalMin = allTasks.reduce((s, t) => s + (t.minHours || 0), 0)
    const totalMax = allTasks.reduce((s, t) => s + (t.maxHours || 0), 0)
    const hoursAccuracy = totalExpected > 0 ? Math.round((totalActual / totalExpected) * 100) : null

    // Risk score (0-100, higher = more risk)
    let riskScore = 0
    const blockedCount = allTasks.filter(t => t.status === 'blocked').length
    const overdueCount = overdueTasks.value.length
    const highUrgency = allTasks.filter(t => (t.urgency || 3) >= 4 && !t.finished).length

    riskScore += Math.min(blockedCount * 15, 30)
    riskScore += Math.min(overdueCount * 10, 30)
    riskScore += Math.min(highUrgency * 5, 20)
    if (hoursAccuracy && hoursAccuracy > 120) riskScore += 10
    // STATS-N1 : la composante vélocité du risque ne s'applique que sur vélocité réelle
    if (!insufficientData && velocityPerWeek < 1 && remaining > 5) riskScore += 10
    riskScore = Math.min(riskScore, 100)

    // Risk label
    const riskLabel = riskScore >= 70 ? 'critical' : riskScore >= 40 ? 'warning' : 'healthy'

    // D-11 : recommandations = clés i18n + params — le RENDU traduit (t(key, params)),
    // jamais de chaîne localisée fabriquée dans un store (C2/C6)
    const recommendations = []
    if (blockedCount > 0) recommendations.push({ type: 'danger', key: 'sm_rec_blocked', params: { n: blockedCount } })
    if (overdueCount > 0) recommendations.push({ type: 'warning', key: 'sm_rec_overdue', params: { n: overdueCount } })
    if (hoursAccuracy && hoursAccuracy > 130) recommendations.push({ type: 'warning', key: 'sm_rec_hours', params: { pct: hoursAccuracy - 100 } })
    if (!insufficientData && velocityPerWeek < 1 && remaining > 3) recommendations.push({ type: 'info', key: 'sm_rec_velocity', params: { v: velocityPerWeek.toFixed(1) } })
    if (doneCount > 0 && riskScore < 30) recommendations.push({ type: 'success', key: 'sm_rec_ontrack', params: { done: doneCount, total: totalTasks } })

    return {
      // STATS-N1 : sous 3 tâches terminées, les prédictions sortent null — jamais un chiffre inventé
      insufficientData,
      doneCount,
      velocityPerWeek: insufficientData ? null : Math.round(velocityPerWeek * 10) / 10,
      remaining,
      weeksToComplete: insufficientData ? null : weeksToComplete,
      estimatedDate: insufficientData ? null : estimatedDate,
      completionPercent: totalTasks > 0 ? Math.round((doneCount / totalTasks) * 100) : 0,
      hoursAccuracy,
      totalActual,
      totalExpected,
      totalMin,
      totalMax,
      riskScore,
      riskLabel,
      blockedCount,
      overdueCount,
      recommendations,
    }
  })
  // ── Load ──
  async function loadTasks() {
    loading.value = true
    lastError.value = null
    try {
      const [tasksRes, projectsRes] = await Promise.all([
        supabase.from('tasks').select('*').order('created_at', { ascending: false }),
        supabase.from('projects').select('*').order('created_at', { ascending: false }),
      ])
      if (tasksRes.error) throw tasksRes.error
      if (projectsRes.error) throw projectsRes.error
      if (tasksRes.data) tasks.value = tasksRes.data.map(dbToTask)
      if (projectsRes.data) projects.value = projectsRes.data.map(dbToProject)
    } catch (err) {
      lastError.value = err.message || 'Failed to load tasks'
      if (window.Sentry) window.Sentry.captureException(err)
    } finally {
      loading.value = false
    }
  }

  // ── Project CRUD ──
  async function addProject(project) {
    lastError.value = null
    try {
      // TASK-WIPE : mêmes défauts d'INSERT ici, projectToDb est partiel-sûr
      const _row = await projectToDb({ color: '#7c3aed', status: 'active', ...project })
      const { data, error } = await withWrite(() => supabase.from('projects').insert([_row]).select().single(), { label: 'tasks.addProject' })
      if (error) throw error
      if (data) projects.value.unshift(dbToProject(data))
      return data
    } catch (err) {
      lastError.value = err.message || 'Failed to add project'
      if (window.Sentry) window.Sentry.captureException(err)
      return null
    }
  }

  async function updateProject(idOrProject, maybeData) {
    lastError.value = null
    try {
      let id, projectData
      if (maybeData !== undefined) {
        id = idOrProject
        projectData = maybeData
      } else {
        id = idOrProject.id
        projectData = idOrProject
      }
      const _row = await projectToDb(projectData)
      const { error } = await withWrite(() => supabase.from('projects').update(_row).eq('id', id), { label: 'tasks.updateProject' })
      if (error) throw error
      const idx = projects.value.findIndex(p => p.id === id)
      if (idx > -1) projects.value[idx] = { ...projects.value[idx], ...projectData }
    } catch (err) {
      lastError.value = err.message || 'Failed to update project'
      if (window.Sentry) window.Sentry.captureException(err)
    }
  }

  async function deleteProject(id) {
    lastError.value = null
    try {
      const { error: tasksErr } = await withWrite(() => supabase.from('tasks').delete().eq('project_id', id), { label: 'tasks.deleteProject.tasks' })
      if (tasksErr) throw tasksErr
      const { error: projErr } = await withWrite(() => supabase.from('projects').delete().eq('id', id), { label: 'tasks.deleteProject.project' })
      if (projErr) throw projErr
      projects.value = projects.value.filter(p => p.id !== id)
      tasks.value = tasks.value.filter(t => t.projectId !== id)
    } catch (err) {
      lastError.value = err.message || 'Failed to delete project'
      if (window.Sentry) window.Sentry.captureException(err)
    }
  }

  // ── Task CRUD ──
  async function addTask(task) {
    lastError.value = null
    try {
      // TASK-WIPE : les défauts d'INSERT vivent ICI (taskToDb est devenu partiel-sûr
      // et ne fabrique plus de valeurs pour les champs absents)
      const _row = await taskToDb({
        title: '', description: '', status: 'todo', priority: 'important',
        assignee: '', tags: [], subtasks: [],
        ...task,
      })
      const { data, error } = await withWrite(() => supabase.from('tasks').insert([_row]).select().single(), { label: 'tasks.addTask' })
      if (error) throw error
      if (data) tasks.value.unshift(dbToTask(data))
      return data
    } catch (err) {
      lastError.value = err.message || 'Failed to add task'
      if (window.Sentry) window.Sentry.captureException(err)
      return null
    }
  }

  async function updateTask(idOrTask, maybeData) {
    lastError.value = null
    try {
      let id, taskData
      if (maybeData !== undefined) {
        id = idOrTask
        taskData = maybeData
      } else {
        id = idOrTask.id
        taskData = idOrTask
      }
      const _row = await taskToDb(taskData)
      const { error } = await withWrite(() => supabase.from('tasks').update(_row).eq('id', id), { label: 'tasks.updateTask' })
      if (error) throw error
      const idx = tasks.value.findIndex(t => t.id === id)
      if (idx > -1) tasks.value[idx] = { ...tasks.value[idx], ...taskData }
    } catch (err) {
      lastError.value = err.message || 'Failed to update task'
      if (window.Sentry) window.Sentry.captureException(err)
    }
  }

  async function deleteTask(id) {
    lastError.value = null
    try {
      const { error: subErr } = await withWrite(() => supabase.from('tasks').delete().eq('parent_id', id), { label: 'tasks.deleteTask.subtasks' })
      if (subErr) throw subErr
      const { error: taskErr } = await withWrite(() => supabase.from('tasks').delete().eq('id', id), { label: 'tasks.deleteTask' })
      if (taskErr) throw taskErr
      tasks.value = tasks.value.filter(t => t.id !== id && t.parentId !== id)
    } catch (err) {
      lastError.value = err.message || 'Failed to delete task'
      if (window.Sentry) window.Sentry.captureException(err)
    }
  }

  async function moveTask(taskId, newStatus) {
    try {
      await updateTask(taskId, { status: newStatus })
    } catch (err) {
      lastError.value = err.message || 'Failed to move task'
      if (window.Sentry) window.Sentry.captureException(err)
    }
  }

  // ── Reset ──
  async function resetAll() {
    lastError.value = null
    try {
      const uid = await getCurrentUserId()
      if (uid) {
        const { error: tErr } = await supabase.from('tasks').delete().eq('user_id', uid)
        if (tErr) throw tErr
        const { error: pErr } = await supabase.from('projects').delete().eq('user_id', uid)
        if (pErr) throw pErr
      }
      tasks.value = []
      projects.value = []
    } catch (err) {
      lastError.value = err.message || 'Failed to reset tasks'
      if (window.Sentry) window.Sentry.captureException(err)
    }
  }

  // ── Mappers — COMPLETE with all Smart Matrice fields ──
  function dbToTask(r) {
    return {
      id: r.id,
      projectId: r.project_id || '',
      parentId: r.parent_id || null,
      title: r.title || '',
      description: r.description || '',
      status: r.status || 'todo',
      priority: r.priority || 'important',
      assignee: r.assignee || '',
      dueDate: r.due_date || '',
      startDate: r.start_date || '',
      endDate: r.end_date || r.due_date || '',
      clientId: r.client_id || '',
      tags: r.tags || [],
      subtasks: r.subtasks || [],
      // Smart Matrice fields
      urgency: r.urgency ?? 3,
      importance: r.importance ?? 3,
      difficulty: r.difficulty ?? 3,
      finished: r.finished ?? false,
      pended: r.pended ?? false,
      actualHours: r.actual_hours ?? 0,
      expectedHours: r.expected_hours ?? 0,
      minHours: r.min_hours ?? 0,
      maxHours: r.max_hours ?? 0,
      level: r.level ?? 0,
      taskType: r.task_type || 'task',
      createdAt: r.created_at || '',
      updatedAt: r.updated_at || '',
    }
  }

  async function taskToDb(t) {
    const user_id = await getCurrentUserId()
    if (!user_id) throw new Error('User not authenticated')
    const obj = {
      user_id,
      updated_at: new Date().toISOString(),
    }
    // TASK-WIPE : un update PARTIEL ne doit JAMAIS écraser les colonnes absentes de
    // l'input. L'ancien code envoyait title/description/status/priority/assignee/
    // tags/subtasks avec des défauts vides à CHAQUE écriture (drag Kanban {status},
    // drop Matrice {priority}, saveCell Projets, toggle playbook) → corruption en
    // base, masquée localement jusqu'au reload. Chaque champ n'est mappé que s'il
    // est fourni ; les défauts d'INSERT vivent dans addTask/addProject.
    if (t.title !== undefined) obj.title = t.title || ''
    if (t.description !== undefined) obj.description = t.description || ''
    if (t.status !== undefined) obj.status = t.status || 'todo'
    if (t.priority !== undefined) obj.priority = t.priority || 'important'
    if (t.assignee !== undefined) obj.assignee = t.assignee || ''
    if (t.tags !== undefined) obj.tags = t.tags || []
    if (t.subtasks !== undefined) obj.subtasks = t.subtasks || []
    // Map all Smart Matrice fields
    if (t.projectId !== undefined) obj.project_id = t.projectId || null
    if (t.parentId !== undefined) obj.parent_id = t.parentId || null
    if (t.dueDate !== undefined) obj.due_date = t.dueDate || null
    if (t.startDate !== undefined) obj.start_date = t.startDate || null
    if (t.endDate !== undefined) obj.end_date = t.endDate || null
    if (t.clientId !== undefined) obj.client_id = t.clientId || ''
    if (t.urgency !== undefined) obj.urgency = t.urgency
    if (t.importance !== undefined) obj.importance = t.importance
    if (t.difficulty !== undefined) obj.difficulty = t.difficulty
    if (t.finished !== undefined) obj.finished = t.finished
    if (t.pended !== undefined) obj.pended = t.pended
    if (t.actualHours !== undefined) obj.actual_hours = t.actualHours
    if (t.expectedHours !== undefined) obj.expected_hours = t.expectedHours
    if (t.minHours !== undefined) obj.min_hours = t.minHours
    if (t.maxHours !== undefined) obj.max_hours = t.maxHours
    if (t.level !== undefined) obj.level = t.level
    if (t.taskType !== undefined) obj.task_type = t.taskType
    return obj
  }

  function dbToProject(r) {
    return { id: r.id, name: r.name, title: r.name, color: r.color || '#7c3aed', status: r.status || 'active' }
  }

  async function projectToDb(p) {
    const user_id = await getCurrentUserId()
    if (!user_id) throw new Error('User not authenticated')
    // TASK-WIPE : partiel-sûr — un champ absent de l'input n'est pas envoyé
    const obj = { user_id }
    if (p.name !== undefined || p.title !== undefined) obj.name = p.name || p.title
    if (p.color !== undefined) obj.color = p.color || '#7c3aed'
    if (p.status !== undefined) obj.status = p.status || 'active'
    return obj
  }

  return {
    tasks, projects, loading, lastError,
    tasksByStatus, urgentTasks, overdueTasks, completionRate,
    predictions,
    loadTasks, addTask, updateTask, deleteTask, moveTask,
    addProject, updateProject, deleteProject,
    resetAll,
  }
})

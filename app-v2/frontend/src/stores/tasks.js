import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { supabase } from '@/lib/supabase'
import { withWrite } from '@/lib/supabaseWrite'
import { fetchAllRows } from '@/lib/fetchAllRows'
import { localDateKey } from '@/lib/formatters'
import { useAuthStore } from './auth'
import { useTeamStore } from './team'

// CORE-V2-TASK (04/10/2026): projects and tasks live in core_v2 (20261004130000) — `project`, `task`,
// `task_assignee` and the organization's lookups `task_status` / `task_urgency` / `task_difficulty`.
// The old `projects` / `tasks` are no longer read. Decided with the model: a task always has a project
// (task_project_required), the client link and the tags are kept, importance / actual hours / priority /
// finished / pended / colour are gone, and the priority matrix works on urgency.
// The views keep reading the shapes they always read (dbToTask / dbToProject): status is the lookup's
// persisted key ('todo'…), urgency and difficulty its level 1..5 (sort_order), dates calendar days.
// A missing value stays null (R21) — never the old "3" or "todo" filled in by the mapper.

// TASK-DATE-NOON: a calendar day is stored as noon UTC of that day, the same calendar day from UTC-11 to
// UTC+11 (20261004130000 moved the old dates the same way). Midnight UTC showed the day before to every
// user west of Greenwich.
function dayToInstant(key) {
  if (!key) return null
  const s = String(key).slice(0, 10)
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s + 'T12:00:00Z' : null
}
function instantToDay(v) { return v ? localDateKey(v) : '' }

// Postgres interval text ('03:30:00', '1 day 02:00:00', '2 days') <-> hours.
function intervalToHours(v) {
  if (v == null || v === '') return null
  const m = /^(?:(-?\d+) days?\s*)?(?:(-?\d+):(\d{2}):(\d{2}(?:\.\d+)?))?$/.exec(String(v).trim())
  if (!m) return null
  const h = (Number(m[1] || 0) * 24) + Number(m[2] || 0) + Number(m[3] || 0) / 60 + Number(m[4] || 0) / 3600
  return Math.round(h * 100) / 100
}
function hoursToInterval(h) {
  if (h === '' || h == null) return null
  const n = Number(h)
  return Number.isFinite(n) && n >= 0 ? n + ' hours' : null
}

export const useTaskStore = defineStore('tasks', () => {
  const taskRows = ref([])
  const projectRows = ref([])
  const statusRows = ref([])
  const urgencyRows = ref([])
  const difficultyRows = ref([])
  // company id (client_group.company_id) <-> the client uuid the client screens use (company.public_id)
  const clientIdByGroup = ref({})
  const loading = ref(false)
  const lastError = ref(null)

  // ── Lookups ──
  const statuses = computed(() => statusRows.value.map(r => ({ id: r.id, key: r.text, order: r.sort_order })))
  const urgencies = computed(() => urgencyRows.value.map(r => ({ id: r.id, key: r.text, level: r.sort_order })))
  const difficulties = computed(() => difficultyRows.value.map(r => ({ id: r.id, key: r.text, level: r.sort_order })))
  const statusKey = (id) => statusRows.value.find(r => r.id === id)?.text ?? null
  const statusId = (key) => statusRows.value.find(r => r.text === key)?.id ?? null
  const level = (rows, id) => rows.find(r => r.id === id)?.sort_order ?? null
  const levelId = (rows, lv) => rows.find(r => r.sort_order === Number(lv))?.id ?? null

  // ── People: task_assignee holds core_v2 personage ids, the screens hold login ids ──
  function personageToUser(pid) {
    const auth = useAuthStore()
    if (pid != null && pid === auth.me?.personage_id) return auth.user?.id || null
    return useTeamStore().members.find(m => m.personageId === pid)?.id || null
  }
  function userToPersonage(uid) {
    const auth = useAuthStore()
    if (uid && uid === auth.user?.id) return auth.me?.personage_id ?? null
    return useTeamStore().members.find(m => m.id === uid)?.personageId ?? null
  }
  function groupForClient(clientId) {
    if (!clientId) return null
    const hit = Object.entries(clientIdByGroup.value).find(([, uuid]) => uuid === clientId)
    return hit ? Number(hit[0]) : null
  }

  // ── Mappers ──
  function dbToTask(r, children) {
    const users = (r.task_assignee || []).map(a => personageToUser(a.member_id)).filter(Boolean)
    const subs = children.get(r.id) || []
    return {
      id: r.id,
      projectId: r.project_id,
      parentId: r.parent_task_id || null,
      milestoneId: r.milestone_id || null,
      title: r.title || '',
      description: r.description?.text || '',
      status: statusKey(r.status_id),
      urgency: level(urgencyRows.value, r.urgency_id),
      difficulty: level(difficultyRows.value, r.difficulty_id),
      assignees: users,
      assignee: users[0] || '',
      clientId: (r.client_group_id != null && clientIdByGroup.value[r.client_group_id]) || null,
      tags: r.tags || [],
      // the sub-tasks, as the old checklist shape the cards draw ({ title, done })
      subtasks: subs.map(c => ({ id: c.id, title: c.title, done: statusKey(c.status_id) === 'done' })),
      startDate: instantToDay(r.start_at),
      dueDate: instantToDay(r.due_at),
      endDate: instantToDay(r.due_at),
      expectedHours: intervalToHours(r.expected_duration),
      minHours: intervalToHours(r.min_duration),
      maxHours: intervalToHours(r.max_duration),
      sortOrder: r.sort_order ?? 0,
      createdBy: r.created_by ?? null,
      createdAt: r.created_at || '',
      updatedAt: r.updated_at || '',
    }
  }

  // TASK-IMPORTED: the project 20261004130000 made for old tasks that had none is untitled and marked;
  // the view names it (nameKey) — a store never translates (rule 5).
  function dbToProject(r) {
    const imported = r.description?.source === 'tasks_without_project'
    return {
      id: r.id,
      name: r.title || '',
      title: r.title || '',
      nameKey: !r.title && imported ? 'project_imported_title' : null,
      imported,
      createdBy: r.created_by ?? null,
      createdAt: r.created_at || '',
    }
  }

  const tasks = computed(() => {
    const children = new Map()
    for (const r of taskRows.value) {
      if (!r.parent_task_id) continue
      if (!children.has(r.parent_task_id)) children.set(r.parent_task_id, [])
      children.get(r.parent_task_id).push(r)
    }
    for (const list of children.values()) list.sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
    return taskRows.value.map(r => dbToTask(r, children))
  })
  const projects = computed(() => projectRows.value.map(dbToProject))

  // Partial-safe (TASK-WIPE): a field absent from the input is not sent.
  function taskToDb(t) {
    const obj = {}
    if (t.title !== undefined) obj.title = t.title || ''
    if (t.description !== undefined) obj.description = t.description ? { text: t.description } : {}
    if (t.status !== undefined) obj.status_id = t.status ? statusId(t.status) : null
    if (t.urgency !== undefined) obj.urgency_id = t.urgency == null ? null : levelId(urgencyRows.value, t.urgency)
    if (t.difficulty !== undefined) obj.difficulty_id = t.difficulty == null ? null : levelId(difficultyRows.value, t.difficulty)
    if (t.projectId !== undefined) obj.project_id = t.projectId || null
    if (t.parentId !== undefined) obj.parent_task_id = t.parentId || null
    if (t.milestoneId !== undefined) obj.milestone_id = t.milestoneId || null
    if (t.clientId !== undefined) obj.client_group_id = groupForClient(t.clientId)
    if (t.tags !== undefined) obj.tags = Array.isArray(t.tags) ? t.tags : []
    if (t.expectedHours !== undefined) obj.expected_duration = hoursToInterval(t.expectedHours)
    if (t.minHours !== undefined) obj.min_duration = hoursToInterval(t.minHours)
    if (t.maxHours !== undefined) obj.max_duration = hoursToInterval(t.maxHours)
    if (t.startDate !== undefined) obj.start_at = dayToInstant(t.startDate)
    if (t.endDate !== undefined) obj.due_at = dayToInstant(t.endDate)
    if (t.dueDate !== undefined) obj.due_at = dayToInstant(t.dueDate)
    if (t.sortOrder !== undefined) obj.sort_order = Number(t.sortOrder) || 0
    return obj
  }

  // ── Computed ──
  const tasksByStatus = computed(() => ({
    todo: tasks.value.filter(t => t.status === 'todo'),
    in_progress: tasks.value.filter(t => t.status === 'in_progress'),
    blocked: tasks.value.filter(t => t.status === 'blocked'),
    done: tasks.value.filter(t => t.status === 'done'),
  }))

  // Auto KPIs batch (contract 22/07, R21): % of done tasks over all loaded tasks. 0 tasks → null.
  const completionRate = computed(() => {
    const total = tasks.value.length
    if (!total) return null
    const done = tasks.value.filter(t => t.status === 'done').length
    return parseFloat(((done / total) * 100).toFixed(1))
  })

  const urgentTasks = computed(() => tasks.value.filter(t => (t.urgency ?? 0) >= 4 && t.status !== 'done'))

  const overdueTasks = computed(() => {
    const today = localDateKey()
    return tasks.value.filter(t => t.dueDate && t.dueDate < today && t.status !== 'done')
  })

  // ── AI Predictions ──
  const predictions = computed(() => {
    const allTasks = tasks.value
    const doneTasks = allTasks.filter(t => t.status === 'done')
    const totalTasks = allTasks.length
    const doneCount = doneTasks.length

    // STATS-N1 (29/08): < 3 completed tasks = no basis for prediction — velocity, remaining weeks
    // and date return null (R21: null = no data, the view shows "not enough data").
    const insufficientData = doneCount < 3

    // Velocity: tasks done per week (based on last 30 days)
    const thirtyDaysAgo = localDateKey(new Date(Date.now() - 30 * 86400000))
    const recentDone = doneTasks.filter(t => t.updatedAt && localDateKey(t.updatedAt) >= thirtyDaysAgo)
    const velocityPerWeek = recentDone.length > 0 ? (recentDone.length / 4.3) : (doneCount > 0 ? doneCount / 12 : 0.5)

    const remaining = totalTasks - doneCount
    const weeksToComplete = velocityPerWeek > 0 ? Math.ceil(remaining / velocityPerWeek) : null
    const estimatedDate = weeksToComplete ? localDateKey(new Date(Date.now() + weeksToComplete * 7 * 86400000)) : null

    const totalExpected = allTasks.reduce((s, t) => s + (t.expectedHours || 0), 0)
    const totalMin = allTasks.reduce((s, t) => s + (t.minHours || 0), 0)
    const totalMax = allTasks.reduce((s, t) => s + (t.maxHours || 0), 0)

    // Risk score (0-100, higher = more risk). The hours-accuracy part went with actual hours (not in the
    // model, decided 04/10/2026).
    let riskScore = 0
    const blockedCount = allTasks.filter(t => t.status === 'blocked').length
    const overdueCount = overdueTasks.value.length
    const highUrgency = allTasks.filter(t => (t.urgency ?? 0) >= 4 && t.status !== 'done').length
    riskScore += Math.min(blockedCount * 15, 30)
    riskScore += Math.min(overdueCount * 10, 30)
    riskScore += Math.min(highUrgency * 5, 20)
    if (!insufficientData && velocityPerWeek < 1 && remaining > 5) riskScore += 10
    riskScore = Math.min(riskScore, 100)
    const riskLabel = riskScore >= 70 ? 'critical' : riskScore >= 40 ? 'warning' : 'healthy'

    // D-11: recommendations = i18n keys + params — the RENDER translates
    const recommendations = []
    if (blockedCount > 0) recommendations.push({ type: 'danger', key: 'smart_matrix_rec_blocked', params: { n: blockedCount } })
    if (overdueCount > 0) recommendations.push({ type: 'warning', key: 'smart_matrix_rec_overdue', params: { n: overdueCount } })
    if (!insufficientData && velocityPerWeek < 1 && remaining > 3) recommendations.push({ type: 'info', key: 'smart_matrix_rec_velocity', params: { v: velocityPerWeek.toFixed(1) } })
    if (doneCount > 0 && riskScore < 30) recommendations.push({ type: 'success', key: 'smart_matrix_rec_ontrack', params: { done: doneCount, total: totalTasks } })

    return {
      insufficientData,
      doneCount,
      velocityPerWeek: insufficientData ? null : Math.round(velocityPerWeek * 10) / 10,
      remaining,
      weeksToComplete: insufficientData ? null : weeksToComplete,
      estimatedDate: insufficientData ? null : estimatedDate,
      completionPercent: totalTasks > 0 ? Math.round((doneCount / totalTasks) * 100) : 0,
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

  // ── Load ── (CAP-1000: complete reads go through fetchAllRows, stable sort)
  async function loadTasks() {
    loading.value = true
    lastError.value = null
    try {
      const [st, ur, di, pr, tk, co] = await Promise.all([
        supabase.from('task_status').select('*').order('sort_order').order('id'),
        supabase.from('task_urgency').select('*').order('sort_order').order('id'),
        supabase.from('task_difficulty').select('*').order('sort_order').order('id'),
        fetchAllRows(() => supabase.from('project').select('*', { count: 'exact' }).order('created_at', { ascending: false }).order('id', { ascending: false })),
        fetchAllRows(() => supabase.from('task').select('*, task_assignee(member_id)', { count: 'exact' }).order('created_at', { ascending: false }).order('id', { ascending: false })),
        fetchAllRows(() => supabase.from('company').select('id, public_id', { count: 'exact' }).order('id')),
      ])
      for (const res of [st, ur, di]) if (res.error) throw res.error
      statusRows.value = st.data || []
      urgencyRows.value = ur.data || []
      difficultyRows.value = di.data || []
      const map = {}
      for (const c of co.rows) if (c.public_id) map[c.id] = c.public_id
      clientIdByGroup.value = map
      projectRows.value = pr.rows
      taskRows.value = tk.rows
    } catch (err) {
      lastError.value = err.message || 'Failed to load tasks'
      if (window.Sentry) window.Sentry.captureException(err)
    } finally {
      loading.value = false
    }
  }

  // ── Project CRUD ── each answers { success, data } or { error } (D-14)
  async function addProject(project) {
    lastError.value = null
    const org = useAuthStore().org?.core_id
    if (!org) return { error: 'no_organization' }
    const title = String(project?.name ?? project?.title ?? '').trim()
    const { data, error } = await withWrite(() => supabase.from('project').insert([{ organization_id: org, title }]).select().single(), { label: 'tasks.addProject' })
    if (error) { lastError.value = error.message || 'Failed to add project'; return { error: error.message || 'save_failed' } }
    projectRows.value = [data, ...projectRows.value]
    return { success: true, data: dbToProject(data) }
  }

  async function updateProject(id, projectData) {
    lastError.value = null
    const patch = {}
    if (projectData?.name !== undefined || projectData?.title !== undefined) patch.title = String(projectData.name ?? projectData.title ?? '').trim()
    if (!Object.keys(patch).length) return { success: true }
    const { data, error } = await withWrite(() => supabase.from('project').update(patch).eq('id', id).select().maybeSingle(), { label: 'tasks.updateProject' })
    if (error || !data) { lastError.value = error?.message || 'not_updated'; return { error: error?.message || 'not_updated' } }
    projectRows.value = projectRows.value.map(p => p.id === id ? data : p)
    return { success: true }
  }

  // The project's tasks first (task -> project has no cascade, by the model), then the project.
  async function deleteProject(id) {
    lastError.value = null
    const { error: tErr } = await withWrite(() => supabase.from('task').delete().eq('project_id', id), { label: 'tasks.deleteProject.tasks' })
    if (tErr) { lastError.value = tErr.message; return { error: tErr.message } }
    const { data, error } = await withWrite(() => supabase.from('project').delete().eq('id', id).select('id'), { label: 'tasks.deleteProject.project' })
    // RLS hides what the caller may not delete: no row back = not deleted (a member deleting a
    // colleague's project, or one still holding a colleague's task).
    if (error || !data?.length) { lastError.value = error?.message || 'not_deleted'; await loadTasks(); return { error: error?.message || 'not_deleted' } }
    projectRows.value = projectRows.value.filter(p => p.id !== id)
    taskRows.value = taskRows.value.filter(t => t.project_id !== id)
    return { success: true }
  }

  // ── Task CRUD ──
  async function setAssignee(taskId, userId) {
    const { error: dErr } = await withWrite(() => supabase.from('task_assignee').delete().eq('task_id', taskId), { label: 'tasks.assignee.clear' })
    if (dErr) return { error: dErr.message }
    let assigned = []
    if (userId) {
      const pid = userToPersonage(userId)
      if (pid == null) return { error: 'assignee_unknown' }
      const { error } = await withWrite(() => supabase.from('task_assignee').insert([{ task_id: taskId, member_id: pid }]), { label: 'tasks.assignee.set' })
      if (error) return { error: error.message }
      assigned = [{ member_id: pid }]
    }
    taskRows.value = taskRows.value.map(r => r.id === taskId ? { ...r, task_assignee: assigned } : r)
    return { success: true }
  }

  async function addTask(task) {
    lastError.value = null
    // Decided 04/10/2026: a task always belongs to a project (task.project_id NOT NULL).
    if (!task?.projectId) return { error: 'task_project_required' }
    const org = useAuthStore().org?.core_id
    if (!org) return { error: 'no_organization' }
    // The insert defaults live HERE (TASK-WIPE): a new task starts in 'todo'.
    const row = { ...taskToDb({ status: 'todo', ...task }), organization_id: org }
    const { data, error } = await withWrite(() => supabase.from('task').insert([row]).select('*, task_assignee(member_id)').single(), { label: 'tasks.addTask' })
    if (error) { lastError.value = error.message || 'Failed to add task'; return { error: error.message || 'save_failed' } }
    taskRows.value = [data, ...taskRows.value]
    if (task.assignee) {
      const a = await setAssignee(data.id, task.assignee)
      if (a.error) return { success: true, data: tasks.value.find(t => t.id === data.id), warning: 'assignee_not_saved' }
    }
    return { success: true, data: tasks.value.find(t => t.id === data.id) }
  }

  async function updateTask(idOrTask, maybeData) {
    lastError.value = null
    const id = maybeData !== undefined ? idOrTask : idOrTask.id
    const taskData = maybeData !== undefined ? maybeData : idOrTask
    const patch = taskToDb(taskData)
    if (Object.keys(patch).length) {
      const { data, error } = await withWrite(() => supabase.from('task').update(patch).eq('id', id).select('*, task_assignee(member_id)').maybeSingle(), { label: 'tasks.updateTask' })
      // An UPDATE matching nothing answers 204 with no error (CHAT-EDIT): no row back = not saved.
      if (error || !data) { lastError.value = error?.message || 'not_updated'; return { error: error?.message || 'not_updated' } }
      taskRows.value = taskRows.value.map(r => r.id === id ? data : r)
      // A task moved to another project takes its sub-tasks with it.
      if (patch.project_id) {
        const { error: subErr } = await withWrite(() => supabase.from('task').update({ project_id: patch.project_id }).eq('parent_task_id', id), { label: 'tasks.updateTask.subtasks' })
        if (subErr) return { error: subErr.message }
        taskRows.value = taskRows.value.map(r => r.parent_task_id === id ? { ...r, project_id: patch.project_id } : r)
      }
    }
    if (taskData.assignee !== undefined) {
      const a = await setAssignee(id, taskData.assignee)
      if (a.error) return a
    }
    return { success: true }
  }

  // Sub-tasks go with their parent (fk_task_parent cascades).
  async function deleteTask(id) {
    lastError.value = null
    const { data, error } = await withWrite(() => supabase.from('task').delete().eq('id', id).select('id'), { label: 'tasks.deleteTask' })
    if (error || !data?.length) { lastError.value = error?.message || 'not_deleted'; return { error: error?.message || 'not_deleted' } }
    const gone = new Set([id])
    let grew = true
    while (grew) {
      grew = false
      for (const r of taskRows.value) if (r.parent_task_id && gone.has(r.parent_task_id) && !gone.has(r.id)) { gone.add(r.id); grew = true }
    }
    taskRows.value = taskRows.value.filter(r => !gone.has(r.id))
    return { success: true }
  }

  async function moveTask(taskId, newStatus) {
    return updateTask(taskId, { status: newStatus })
  }

  // ── Reset ── what the caller created: their tasks, then their projects (a project still holding a
  // colleague's task stays — the database refuses, and the screen is reloaded to say so).
  async function resetAll() {
    lastError.value = null
    const me = useAuthStore().me?.personage_id
    if (me == null) return { error: 'no_user' }
    const { error: tErr } = await withWrite(() => supabase.from('task').delete().eq('created_by', me), { label: 'tasks.resetAll.tasks' })
    if (tErr) { lastError.value = tErr.message; return { error: tErr.message } }
    const { error: pErr } = await withWrite(() => supabase.from('project').delete().eq('created_by', me), { label: 'tasks.resetAll.projects' })
    await loadTasks()
    if (pErr) { lastError.value = pErr.message; return { error: pErr.message } }
    return { success: true }
  }

  function clear() {
    taskRows.value = []
    projectRows.value = []
  }

  return {
    tasks, projects, statuses, urgencies, difficulties, loading, lastError,
    tasksByStatus, urgentTasks, overdueTasks, completionRate,
    predictions,
    loadTasks, addTask, updateTask, deleteTask, moveTask,
    addProject, updateProject, deleteProject,
    resetAll, clear,
  }
})

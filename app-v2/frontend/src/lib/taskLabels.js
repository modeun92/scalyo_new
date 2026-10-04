// CORE-V2-TASK (04/10/2026): labels for the task lookups and projects, shared by the task screens.
// A lookup's text is a persisted KEY for the rows every organization is seeded with ('todo', 'high',
// 'very_easy'…) and free text for one an organization added itself: the label is the translation when
// one exists, else the text as typed — never a key shown raw for a seeded value, never a guessed one.
export function lookupLabel({ t, te }, prefix, key) {
  if (key == null || key === '') return '—'
  return te(prefix + key) ? t(prefix + key) : key
}

export const statusLabel = (i18n, key) => lookupLabel(i18n, 'status_', key)
export const urgencyLabel = (i18n, key) => lookupLabel(i18n, 'task_urgency_', key)
export const difficultyLabel = (i18n, key) => lookupLabel(i18n, 'task_difficulty_', key)

// TASK-IMPORTED: the project made for old tasks that had none carries no title — it is named here.
export function projectLabel({ t }, project) {
  if (!project) return ''
  return project.nameKey ? t(project.nameKey) : (project.name || '')
}

// The colour step of an urgency level (1..5): what the cards, the Gantt and the dashboard draw.
export function urgencyTone(level) {
  if (level == null) return 'none'
  if (level >= 5) return 'critical'
  if (level >= 4) return 'high'
  if (level >= 3) return 'medium'
  return 'low'
}

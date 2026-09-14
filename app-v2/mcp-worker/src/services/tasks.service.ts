// Task reads for MCP.
//
// MCP-TASKS-SELF (14/09/2026): filtered to user_id = the authenticated user, matching
// what context.service.js does for the AI context. `tasks` is a 30-column table whose RLS
// is not org-wide the way `clients` is; an unfiltered read here would be a behaviour
// change disguised as a feature. get_my_tasks means MY tasks.

import type { UserSupabaseClient } from '../supabase/user-client'
import { daysUntil } from '../domain/health'

const TASK_COLUMNS = 'id,title,due_date,status,priority,client_id,created_at'
const TASK_FILTERABLE = ['id', 'user_id', 'due_date', 'status', 'priority', 'client_id', 'created_at'] as const

// Excluded on purpose: description and subtasks are free-form CSM prose, same privacy
// class as client notes; the estimation columns (min/max/expected/actual_hours,
// difficulty, importance) feed Oxygen workload, which is legally self-only data and has
// no business reaching an external AI client.
export const EXCLUDED_TASK_COLUMNS = [
  'description', 'subtasks', 'min_hours', 'max_hours', 'expected_hours', 'actual_hours', 'difficulty', 'importance', 'level',
] as const

export interface TaskRow {
  id: string
  title: string | null
  due_date: string | null
  status: string | null
  priority?: string | null
  client_id?: string | null
  created_at?: string | null
}

export interface GetMyTasksInput {
  overdueOnly: boolean
  includeDone: boolean
  limit: number
}

export async function getMyTasks(db: UserSupabaseClient, userId: string, input: GetMyTasksInput) {
  const rows = await db.select<TaskRow>('tasks', {
    columns: TASK_COLUMNS,
    filters: [{ column: 'user_id', op: 'eq', value: userId }],
    order: { column: 'due_date', ascending: true },
    limit: Math.min(input.limit * 3, 200),
    allowedColumns: TASK_FILTERABLE,
  })

  const reference = new Date()
  const mapped = rows
    .filter((t) => (input.includeDone ? true : t.status !== 'done'))
    .map((t) => {
      const days = daysUntil(t.due_date, reference)
      return {
        id: t.id,
        title: t.title,
        status: t.status,
        priority: t.priority ?? null,
        clientId: t.client_id ?? null,
        dueDate: t.due_date,
        daysUntilDue: days,
        overdue: days !== null && days < 0 && t.status !== 'done',
      }
    })
    .filter((t) => (input.overdueOnly ? t.overdue : true))

  return {
    count: Math.min(mapped.length, input.limit),
    truncated: mapped.length > input.limit,
    tasks: mapped.slice(0, input.limit),
  }
}

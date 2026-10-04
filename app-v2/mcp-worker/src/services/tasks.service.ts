// Task reads for MCP.
//
// MCP-TASKS-SELF (14/09/2026): MY tasks only. Since 04/10/2026 (CORE-V2-TASK) tasks live in core_v2
// and "mine" has one definition, the read-only RPC core_v2_my_tasks() (20261004130000): the tasks the
// caller created or is assigned to, read under their own token and RLS (SECURITY INVOKER), the same
// function the AI context reads. An organization-wide read here would be a behaviour change disguised
// as a feature.

import type { UserSupabaseClient } from '../supabase/user-client'
import { daysUntil } from '../domain/health'
import { ScalyoMcpError } from '../errors'

// Never returned, and core_v2_my_tasks does not select them: description is free-form CSM prose, same
// privacy class as client notes; the estimation (expected / min / max duration, difficulty) feeds
// Oxygen workload, which is legally self-only data and has no business reaching an external AI client.
export const EXCLUDED_TASK_COLUMNS = [
  'description', 'expected_duration', 'min_duration', 'max_duration', 'difficulty_id',
] as const

export interface MyTaskRow {
  id: string
  title: string | null
  status: string | null
  urgency: number | null
  due_at: string | null
  project_id: string | null
  client_id: string | null
  assigned_to_me: boolean
  created_at: string | null
}

export async function readMyTasks(db: UserSupabaseClient): Promise<MyTaskRow[]> {
  const rows = await db.rpc<MyTaskRow[] | null>('core_v2_my_tasks')
  // R21: an answer that is not a list is an upstream fault, never "no tasks".
  if (!Array.isArray(rows)) throw new ScalyoMcpError('UPSTREAM_UNAVAILABLE', 'core_v2_my_tasks did not return an array')
  return rows
}

export interface GetMyTasksInput {
  overdueOnly: boolean
  includeDone: boolean
  limit: number
}

export async function getMyTasks(db: UserSupabaseClient, input: GetMyTasksInput) {
  const rows = await readMyTasks(db)

  const reference = new Date()
  const mapped = rows
    .filter((t) => (input.includeDone ? true : t.status !== 'done'))
    .map((t) => {
      // the due date is a calendar day stored at noon UTC (TASK-DATE-NOON): its first 10 characters
      const dueDate = t.due_at ? String(t.due_at).slice(0, 10) : null
      const days = daysUntil(dueDate, reference)
      return {
        id: t.id,
        title: t.title,
        status: t.status,
        urgency: t.urgency ?? null,
        clientId: t.client_id ?? null,
        dueDate,
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

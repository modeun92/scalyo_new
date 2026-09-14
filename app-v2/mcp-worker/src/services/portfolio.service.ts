// Portfolio aggregation for MCP.
//
// MCP-PORTFOLIO (14/09/2026): the aggregate rules are the ones the Scalyo UI already
// applies, restated here because this Worker cannot import the front-end stores:
//   - prospects are EXCLUDED from every counter and aggregate (lesson COUNT-353-352);
//   - the average health ignores clients with no score rather than counting them as 0;
//   - a null ARR stays null and is reported as `clientsWithoutArr`, never summed as 0 (R21).
//
// If this disagrees with the Portfolio screen, the screen is right and this is the bug.

import type { UserSupabaseClient } from '../supabase/user-client'
import { clientArr, daysUntil, healthStatus, isCustomer, toHealthNumber, HEALTH_MAX, HEALTH_THRESHOLDS } from '../domain/health'
import type { ClientRow } from './clients.service'

const PORTFOLIO_COLUMNS = 'id,name,health,status,arr,mrr,renewal_date,lifecycle,churn_risk'
const PORTFOLIO_FILTERABLE = ['id', 'name', 'health', 'status', 'arr', 'mrr', 'renewal_date', 'lifecycle', 'churn_risk'] as const

const TASK_COLUMNS = 'id,title,due_date,status'
const TASK_FILTERABLE = ['id', 'user_id', 'due_date', 'status', 'client_id', 'created_at'] as const

/**
 * Scan ceiling for the portfolio aggregate. A portfolio larger than this produces a
 * summary flagged `partial: true` rather than a wrong total — an AI client must never be
 * handed a confident ARR that silently omits accounts.
 */
const PORTFOLIO_SCAN_LIMIT = 200

export async function getPortfolioSummary(db: UserSupabaseClient, userId: string) {
  const [rows, tasks] = await Promise.all([
    db.select<ClientRow>('clients', {
      columns: PORTFOLIO_COLUMNS,
      order: { column: 'name', ascending: true },
      limit: PORTFOLIO_SCAN_LIMIT,
      allowedColumns: PORTFOLIO_FILTERABLE,
    }),
    db.select<{ id: string; title: string | null; due_date: string | null; status: string | null }>('tasks', {
      columns: TASK_COLUMNS,
      filters: [{ column: 'user_id', op: 'eq', value: userId }],
      order: { column: 'due_date', ascending: true },
      limit: 200,
      allowedColumns: TASK_FILTERABLE,
    }),
  ])

  const reference = new Date()
  const portfolio = rows.filter(isCustomer)
  const prospects = rows.length - portfolio.length

  // ARR: sum only the known values, and say how many were unknown.
  let totalArr = 0
  let clientsWithoutArr = 0
  let arrAtRisk = 0
  for (const client of portfolio) {
    const arr = clientArr(client)
    if (arr === null) {
      clientsWithoutArr++
      continue
    }
    totalArr += arr
    if (healthStatus(client.health, client.status) !== 'healthy') arrAtRisk += arr
  }

  const scores = portfolio.map((c) => toHealthNumber(c.health)).filter((h): h is number => h !== null)
  const averageHealth = scores.length ? Number((scores.reduce((s, h) => s + h, 0) / scores.length).toFixed(1)) : null

  const distribution = { critical: 0, watch: 0, healthy: 0 }
  for (const client of portfolio) distribution[healthStatus(client.health, client.status)]++

  const renewalsNext30Days = portfolio.filter((c) => {
    const d = daysUntil(c.renewal_date, reference)
    return d !== null && d >= 0 && d <= 30
  }).length

  const renewalsOverdue = portfolio.filter((c) => {
    const d = daysUntil(c.renewal_date, reference)
    return d !== null && d < 0
  }).length

  const overdueTasks = tasks.filter((t) => {
    const d = daysUntil(t.due_date, reference)
    return d !== null && d < 0 && t.status !== 'done'
  }).length

  return {
    healthScale: {
      max: HEALTH_MAX,
      critical: '<= ' + HEALTH_THRESHOLDS.critical,
      watch: HEALTH_THRESHOLDS.critical + 1 + '-' + HEALTH_THRESHOLDS.watch,
      healthy: '> ' + HEALTH_THRESHOLDS.watch,
      note: 'Effective status is the worst of (score, entered status).',
    },
    clientCount: portfolio.length,
    prospectsExcluded: prospects,
    totalArr,
    clientsWithoutArr,
    arrAtRisk,
    averageHealth,
    healthDistribution: distribution,
    renewalsNext30Days,
    renewalsOverdue,
    overdueTasks,
    // Honest truncation flag rather than a quietly wrong total.
    partial: rows.length >= PORTFOLIO_SCAN_LIMIT,
    partialNote:
      rows.length >= PORTFOLIO_SCAN_LIMIT
        ? 'More than ' + PORTFOLIO_SCAN_LIMIT + ' accounts are visible; these figures cover the first ' + PORTFOLIO_SCAN_LIMIT + ' by name and are incomplete.'
        : null,
    /** Currency is a property of the account, not the language (rule 9). */
    currencyNote: 'Amounts are in the account currency set in Scalyo > Settings > Preferences. No conversion is applied.',
  }
}

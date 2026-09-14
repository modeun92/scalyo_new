// Client reads for MCP.
//
// MCP-MINIMIZE (14/09/2026): explicit column lists, never select=*. The excluded columns
// are excluded on purpose and removing one from EXCLUDED_COLUMNS is a privacy decision,
// not a refactor:
//   contacts  — customer names, emails, phone numbers. Straight PII to a third-party AI.
//   notes     — free-form CSM prose. Routinely contains commercial and personal detail.
//   logo      — remote asset URL, no value to an assistant.
//   churned_at, user_id, csm_id — internal identifiers, no value to an assistant.
// context.service.js already made exactly this call for the AI prompt (D3). MCP must not
// quietly reverse it: the gap plan requires notes and contacts to get their own privacy
// review before they are ever exposed here.

import { ScalyoMcpError } from '../errors'
import type { UserSupabaseClient, Filter } from '../supabase/user-client'
import { clientArr, daysUntil, healthStatus, isCustomer, toHealthNumber, HEALTH_MAX } from '../domain/health'
import type { EffectiveStatus } from '../domain/health'

/** Columns returned by list-shaped tools. */
const CLIENT_LIST_COLUMNS = 'id,name,health,status,arr,mrr,renewal_date,lifecycle,churn_risk'
/** Columns returned by get_client_overview. A superset of the list columns. */
const CLIENT_DETAIL_COLUMNS = CLIENT_LIST_COLUMNS + ',industry,csm,nps,pipeline_stage,created_at,updated_at'

/**
 * Columns the caller may filter or sort on. Deliberately NOT the same set as the returned
 * columns: `notes` is neither returned nor filterable, so a caller cannot binary-search a
 * note's contents through repeated ilike probes.
 */
const CLIENT_FILTERABLE_COLUMNS = [
  'id', 'name', 'health', 'status', 'arr', 'mrr', 'renewal_date', 'lifecycle', 'churn_risk', 'industry', 'csm', 'created_at',
] as const

/** Named so a future contributor sees the decision rather than an absence. */
export const EXCLUDED_COLUMNS = ['contacts', 'notes', 'logo', 'churned_at', 'user_id', 'csm_id'] as const

/**
 * Ceiling for any read that ranks or filters IN THE WORKER rather than in PostgREST.
 *
 * MCP-PARTIAL-HONEST (14/09/2026, fourth review §11): hitting this ceiling means rows
 * that would have matched were never fetched, so the answer is incomplete. Every such
 * result carries `partial: true` and says so, exactly as get_portfolio_summary already
 * did. `truncated` is a different statement — "more matched than your limit asked for" —
 * and conflating the two is how a model tells a customer "you have 3 at-risk accounts"
 * when the 4th simply sat past the scan window (R21: silence is not zero).
 *
 * The real fix at scale is a database-side filter or an RPC; until then the flag is what
 * keeps the answer honest.
 */
const SCAN_LIMIT = 200

export interface ClientRow {
  id: string
  name: string | null
  health: unknown
  status: string | null
  arr: unknown
  mrr: unknown
  renewal_date: string | null
  lifecycle: string | null
  churn_risk: unknown
  industry?: string | null
  csm?: string | null
  nps?: unknown
  pipeline_stage?: string | null
  created_at?: string | null
  updated_at?: string | null
}

export interface ClientSummary {
  id: string
  name: string | null
  /** Raw score on the /10 scale, or null. Never a substituted 0. */
  health: number | null
  healthScale: string
  effectiveStatus: EffectiveStatus
  arr: number | null
  renewalDate: string | null
  daysToRenewal: number | null
  renewalOverdue: boolean
  lifecycle: string | null
  churnRisk: number | null
  riskReasons: string[]
}

function churnRiskNumber(value: unknown): number | null {
  if (value == null || value === '') return null
  const n = Number(value)
  return Number.isNaN(n) ? null : n
}

/**
 * Why this account is flagged. Returned as stable machine tokens, not prose — the client
 * model writes the sentence, we supply the facts (Rule 4 of the gap plan).
 */
export function riskReasons(client: ClientRow, reference: Date = new Date()): string[] {
  const reasons: string[] = []
  const effective = healthStatus(client.health, client.status)
  if (effective === 'critical') reasons.push('critical_health')
  else if (effective === 'watch') reasons.push('watch_health')

  const days = daysUntil(client.renewal_date, reference)
  if (days !== null) {
    if (days < 0) reasons.push('renewal_overdue')
    else if (days <= 30) reasons.push('renewal_within_30_days')
    else if (days <= 90) reasons.push('renewal_within_90_days')
  }

  const churn = churnRiskNumber(client.churn_risk)
  // churn_risk is stored 0..100 in the app. A real 0 means "no risk recorded as zero",
  // which is not a reason — but it is also not missing data (R21).
  if (churn !== null && churn >= 70) reasons.push('high_churn_risk')

  return reasons
}

export function toClientSummary(client: ClientRow, reference: Date = new Date()): ClientSummary {
  const days = daysUntil(client.renewal_date, reference)
  return {
    id: client.id,
    name: client.name,
    health: toHealthNumber(client.health),
    healthScale: '/' + HEALTH_MAX,
    effectiveStatus: healthStatus(client.health, client.status),
    arr: clientArr(client),
    renewalDate: client.renewal_date,
    daysToRenewal: days,
    // LYO-CONTEXT-2: a PAST renewal date is overdue, never "upcoming". The AI answers
    // presented a four-month-late date as a coming renewal.
    renewalOverdue: days !== null && days < 0,
    lifecycle: client.lifecycle,
    churnRisk: churnRiskNumber(client.churn_risk),
    riskReasons: riskReasons(client, reference),
  }
}

export interface SearchClientsInput {
  query?: string
  status?: EffectiveStatus
  lifecycle?: 'client' | 'prospect'
  renewalBefore?: string
  limit: number
}

export async function searchClients(db: UserSupabaseClient, input: SearchClientsInput) {
  const filters: Filter[] = []

  if (input.query) {
    // The value is quoted by the client layer, so `%` is the only wildcard the caller
    // gets and a comma cannot start a new filter.
    filters.push({ column: 'name', op: 'ilike', value: '%' + input.query + '%' })
  }
  if (input.lifecycle) {
    filters.push({ column: 'lifecycle', op: 'eq', value: input.lifecycle })
  }
  if (input.renewalBefore) {
    filters.push({ column: 'renewal_date', op: 'lte', value: input.renewalBefore })
  }

  // Over-fetch, because `status` is an EFFECTIVE status computed from two columns and
  // cannot be expressed as a PostgREST filter. Capped so this stays a bounded read.
  const overFetch = input.status ? Math.min(input.limit * 5, SCAN_LIMIT) : input.limit

  const rows = await db.select<ClientRow>('clients', {
    columns: CLIENT_LIST_COLUMNS,
    filters,
    order: { column: 'name', ascending: true },
    limit: overFetch,
    allowedColumns: CLIENT_FILTERABLE_COLUMNS,
  })

  const reference = new Date()
  const filtered = input.status ? rows.filter((r) => healthStatus(r.health, r.status) === input.status) : rows

  // The fetch ceiling was reached, so matching accounts may exist beyond it — and with a
  // `status` filter applied after the fetch, some of what WAS fetched got discarded, which
  // makes the shortfall invisible without this flag.
  const partial = rows.length >= overFetch

  return {
    count: Math.min(filtered.length, input.limit),
    truncated: filtered.length > input.limit,
    partial,
    partialNote: partial
      ? 'Only the first ' + rows.length + ' accounts were scanned; accounts matching beyond that are not included.'
      : null,
    clients: filtered.slice(0, input.limit).map((r) => toClientSummary(r, reference)),
  }
}

export async function getClientOverview(db: UserSupabaseClient, clientId: string) {
  const rows = await db.select<ClientRow>('clients', {
    columns: CLIENT_DETAIL_COLUMNS,
    filters: [{ column: 'id', op: 'eq', value: clientId }],
    limit: 1,
    allowedColumns: CLIENT_FILTERABLE_COLUMNS,
  })

  const client = rows[0]
  // RLS returns zero rows both for "does not exist" and for "belongs to another
  // organization". We deliberately do not distinguish them — see errors.ts.
  if (!client) throw new ScalyoMcpError('NOT_FOUND', 'client ' + clientId + ' not visible to this user')

  const reference = new Date()
  return {
    ...toClientSummary(client, reference),
    industry: client.industry ?? null,
    csm: client.csm ?? null,
    nps: client.nps == null || client.nps === '' ? null : Number(client.nps),
    pipelineStage: client.pipeline_stage ?? null,
    createdAt: client.created_at ?? null,
    updatedAt: client.updated_at ?? null,
    // Told explicitly so the model does not infer these are empty rather than withheld.
    omittedFields: {
      note: 'Contacts and free-form notes are never exposed through MCP.',
      fields: EXCLUDED_COLUMNS,
    },
  }
}

export async function getAtRiskClients(db: UserSupabaseClient, limit: number) {
  // Read a bounded page and rank in the Worker: "at risk" is the effective status plus
  // renewal timing plus churn risk, none of which PostgREST can order by.
  const rows = await db.select<ClientRow>('clients', {
    columns: CLIENT_LIST_COLUMNS,
    order: { column: 'name', ascending: true },
    limit: SCAN_LIMIT,
    allowedColumns: CLIENT_FILTERABLE_COLUMNS,
  })

  const reference = new Date()
  const scored = rows
    .filter(isCustomer) // prospects are excluded from alerts
    .map((r) => toClientSummary(r, reference))
    .filter((c) => c.riskReasons.length > 0)
    .sort((a, b) => {
      // Critical first, then by ARR. A null ARR sorts last rather than as 0 (R21).
      const rank = (s: ClientSummary) => (s.effectiveStatus === 'critical' ? 0 : s.effectiveStatus === 'watch' ? 1 : 2)
      if (rank(a) !== rank(b)) return rank(a) - rank(b)
      return (b.arr ?? -1) - (a.arr ?? -1)
    })

  // "Which customers need my attention?" is the question this tool answers, and an
  // incomplete answer to it is worse than a refusal: the account that goes unmentioned is
  // the one nobody calls.
  const partial = rows.length >= SCAN_LIMIT

  return {
    count: Math.min(scored.length, limit),
    truncated: scored.length > limit,
    scannedClients: rows.length,
    partial,
    partialNote: partial
      ? 'More than ' + SCAN_LIMIT + ' accounts are visible; only the first ' + SCAN_LIMIT + ' by name were assessed for risk.'
      : null,
    clients: scored.slice(0, limit),
  }
}

export async function getUpcomingRenewals(db: UserSupabaseClient, withinDays: number, limit: number) {
  const reference = new Date()
  const today = reference.toISOString().slice(0, 10)
  const horizon = new Date(reference.getTime() + withinDays * 86400000).toISOString().slice(0, 10)
  const renewalScan = Math.min(limit * 2, SCAN_LIMIT)

  const rows = await db.select<ClientRow>('clients', {
    columns: CLIENT_LIST_COLUMNS,
    // Strict window: gte today excludes past dates. An overdue renewal is NOT an upcoming
    // one and is reported by get_at_risk_clients instead.
    filters: [
      { column: 'renewal_date', op: 'gte', value: today },
      { column: 'renewal_date', op: 'lte', value: horizon },
    ],
    order: { column: 'renewal_date', ascending: true },
    limit: renewalScan,
    allowedColumns: CLIENT_FILTERABLE_COLUMNS,
  })

  const upcoming = rows.filter(isCustomer).map((r) => toClientSummary(r, reference))

  // Prospects are dropped AFTER the fetch, so a window full of prospects can push real
  // renewals past the ceiling. Ordered by renewal_date, so what is missing is the LATEST
  // ones in the window — which is exactly what a user planning a month would notice.
  const partial = rows.length >= renewalScan

  return {
    windowDays: withinDays,
    count: Math.min(upcoming.length, limit),
    truncated: upcoming.length > limit,
    partial,
    partialNote: partial
      ? 'Only the first ' + rows.length + ' renewals in this window were scanned; later ones are not included.'
      : null,
    clients: upcoming.slice(0, limit),
  }
}

export const __testing = { CLIENT_LIST_COLUMNS, CLIENT_DETAIL_COLUMNS, CLIENT_FILTERABLE_COLUMNS }

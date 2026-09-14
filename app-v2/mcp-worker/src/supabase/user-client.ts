// USER-SCOPED Supabase REST client — the ONLY database path for MCP tools.
//
// MCP-RLS (14/09/2026): anon key + the USER's access token, exactly the pattern
// functions/api/_services/context.service.js already uses for the AI context. RLS
// evaluates auth.uid() and the caller sees precisely what they see in the Scalyo UI —
// no more. The service-role client in functions/api/_utils/supabase.js bypasses RLS and
// must NEVER be reached from here; the key is not even bound to this Worker (see env.ts).
//
// MCP-NO-RAW-FILTER: callers cannot pass PostgREST syntax. Every filter goes through a
// column allowlist and an operator allowlist, and values are quoted so a value containing
// , . ( ) or " is data, never syntax. Without this,
// search_clients({ query: "*,organization_id.neq.x" }) would be a filter injection.

import type { ScalyoMcpConfig } from '../env'
import { ScalyoMcpError } from '../errors'

/** Operators a tool may use. No `not`, no `or`, no full-text expression building. */
export type FilterOperator = 'eq' | 'neq' | 'gte' | 'lte' | 'gt' | 'lt' | 'in' | 'ilike' | 'is'

export interface Filter {
  column: string
  op: FilterOperator
  value: string | number | null | Array<string | number>
}

export interface SelectOptions {
  /** Explicit column list. A `*` is rejected — output minimization is not optional. */
  columns: string
  filters?: Filter[]
  order?: { column: string; ascending?: boolean }
  limit?: number
  /** Columns this table may be filtered or ordered on. */
  allowedColumns: readonly string[]
}

const ALLOWED_OPERATORS: ReadonlySet<string> = new Set<FilterOperator>([
  'eq', 'neq', 'gte', 'lte', 'gt', 'lt', 'in', 'ilike', 'is',
])

/**
 * PostgREST treats a comma as a value separator and a double quote as a quote. Wrapping
 * a value in double quotes and escaping embedded quotes and backslashes makes a
 * user-supplied string inert.
 */
export function quoteValue(value: string): string {
  return '"' + value.replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"'
}

export function renderFilterValue(filter: Filter): string {
  if (filter.op === 'is') {
    // Only `is.null` is meaningful for our reads, and it must not be quoted.
    if (filter.value !== null) throw new ScalyoMcpError('INTERNAL_ERROR', 'is filter accepts only null')
    return 'is.null'
  }
  if (filter.op === 'in') {
    const list = Array.isArray(filter.value) ? filter.value : [filter.value as string]
    return 'in.(' + list.map((v) => quoteValue(String(v))).join(',') + ')'
  }
  if (filter.value === null) throw new ScalyoMcpError('INTERNAL_ERROR', 'a null value needs the is operator')
  return filter.op + '.' + quoteValue(String(filter.value))
}

export interface UserSupabaseClient {
  select<T = Record<string, unknown>>(table: string, options: SelectOptions): Promise<T[]>
}

export function buildSelectParams(options: SelectOptions): URLSearchParams {
  if (!options.columns || options.columns.includes('*')) {
    throw new ScalyoMcpError('INTERNAL_ERROR', 'select=* is forbidden for MCP reads')
  }

  const params = new URLSearchParams()
  params.set('select', options.columns)

  for (const filter of options.filters || []) {
    if (!ALLOWED_OPERATORS.has(filter.op)) {
      throw new ScalyoMcpError('INTERNAL_ERROR', 'operator not allowed: ' + filter.op)
    }
    if (!options.allowedColumns.includes(filter.column)) {
      throw new ScalyoMcpError('INTERNAL_ERROR', 'column not filterable: ' + filter.column)
    }
    params.append(filter.column, renderFilterValue(filter))
  }

  if (options.order) {
    if (!options.allowedColumns.includes(options.order.column)) {
      throw new ScalyoMcpError('INTERNAL_ERROR', 'column not sortable: ' + options.order.column)
    }
    params.set('order', options.order.column + '.' + (options.order.ascending === false ? 'desc' : 'asc') + '.nullslast')
  }

  // MCP-BOUNDED-READ: every MCP read is capped. This is NOT fetchAllRows (rule 6) and must
  // not become it — an AI client asking for "all clients" should get a bounded, ordered
  // page with an explicit truncation flag, not a 4000-row dump it will then summarise
  // badly. The 1000-row PostgREST ceiling is never reached here.
  params.set('limit', String(Math.min(Math.max(options.limit ?? 50, 1), 200)))
  return params
}

export function createUserScopedSupabaseClient(config: ScalyoMcpConfig, userAccessToken: string): UserSupabaseClient {
  if (!userAccessToken) throw new ScalyoMcpError('UNAUTHENTICATED', 'no access token passed to the user-scoped client')

  return {
    async select<T = Record<string, unknown>>(table: string, options: SelectOptions): Promise<T[]> {
      const params = buildSelectParams(options)

      let response: Response
      try {
        response = await fetch(config.supabaseUrl + '/rest/v1/' + table + '?' + params.toString(), {
          headers: {
            apikey: config.supabaseAnonKey,
            Authorization: 'Bearer ' + userAccessToken,
            Accept: 'application/json',
          },
        })
      } catch (cause) {
        // R21: a network failure is NOT "0 rows". It must surface as an error so that no
        // tool can report an empty portfolio that is really an unreachable database.
        throw new ScalyoMcpError('UPSTREAM_UNAVAILABLE', 'fetch failed for ' + table + ': ' + String(cause))
      }

      if (response.status === 401 || response.status === 403) {
        throw new ScalyoMcpError('UNAUTHENTICATED', table + ' returned ' + response.status)
      }
      if (!response.ok) {
        // The PostgREST body names tables and constraints — it goes to the log only.
        throw new ScalyoMcpError(
          'UPSTREAM_UNAVAILABLE',
          table + ' returned ' + response.status + ': ' + (await response.text()).slice(0, 500)
        )
      }

      const rows = await response.json()
      if (!Array.isArray(rows)) throw new ScalyoMcpError('UPSTREAM_UNAVAILABLE', table + ' did not return an array')
      return rows as T[]
    },
  }
}

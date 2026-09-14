// Input safety: the MCP caller must never be able to build a database query.
//
// These are the regression tests for MCP-NO-RAW-FILTER. The attack they encode is real:
// PostgREST reads `,` as a filter separator, so an unescaped `name=ilike.*%foo,bar%*`
// becomes two filters, and a caller who can append filters can append
// `organization_id=neq.<own-org>`.

import { describe, it, expect } from 'vitest'

import { buildSelectParams, quoteValue, renderFilterValue } from '../src/supabase/user-client'
import { ScalyoMcpError } from '../src/errors'
import { __testing } from '../src/services/clients.service'
import { EXCLUDED_COLUMNS } from '../src/services/clients.service'
import { EXCLUDED_TASK_COLUMNS } from '../src/services/tasks.service'

const ALLOWED = ['id', 'name', 'health', 'status'] as const

describe('value quoting neutralises PostgREST syntax', () => {
  it('wraps values in double quotes', () => {
    expect(quoteValue('Acme')).toBe('"Acme"')
  })

  it('contains a comma inside the quoted value instead of starting a new filter', () => {
    const rendered = renderFilterValue({ column: 'name', op: 'ilike', value: '%a,organization_id.neq.x%' })
    expect(rendered).toBe('ilike."%a,organization_id.neq.x%"')
    // The comma is inside the quotes: PostgREST reads one filter, not two.
    expect(rendered.indexOf(',')).toBeGreaterThan(rendered.indexOf('"'))
  })

  it('escapes embedded quotes so the value cannot close its own quoting', () => {
    expect(quoteValue('a"b')).toBe('"a\\"b"')
    expect(quoteValue('a\\b')).toBe('"a\\\\b"')
  })
})

describe('column and operator allowlists', () => {
  it('rejects a filter on a column that is not allowlisted', () => {
    expect(() =>
      buildSelectParams({ columns: 'id,name', allowedColumns: ALLOWED, filters: [{ column: 'notes', op: 'ilike', value: '%x%' }] })
    ).toThrow(ScalyoMcpError)
  })

  it('rejects an operator outside the allowlist', () => {
    expect(() =>
      buildSelectParams({
        columns: 'id,name',
        allowedColumns: ALLOWED,
        filters: [{ column: 'name', op: 'fts' as never, value: 'x' }],
      })
    ).toThrow(ScalyoMcpError)
  })

  it('rejects sorting on a column that is not allowlisted', () => {
    expect(() =>
      buildSelectParams({ columns: 'id,name', allowedColumns: ALLOWED, order: { column: 'contacts' } })
    ).toThrow(ScalyoMcpError)
  })
})

describe('output minimization is enforced at the client layer', () => {
  it('refuses select=*', () => {
    expect(() => buildSelectParams({ columns: '*', allowedColumns: ALLOWED })).toThrow(ScalyoMcpError)
    expect(() => buildSelectParams({ columns: 'id,*', allowedColumns: ALLOWED })).toThrow(ScalyoMcpError)
  })

  it('never selects an excluded client column', () => {
    for (const column of EXCLUDED_COLUMNS) {
      expect(__testing.CLIENT_LIST_COLUMNS.split(',')).not.toContain(column)
      expect(__testing.CLIENT_DETAIL_COLUMNS.split(',')).not.toContain(column)
    }
  })

  it('never lets an excluded column be filtered on, so it cannot be probed', () => {
    for (const column of EXCLUDED_COLUMNS) {
      expect(__testing.CLIENT_FILTERABLE_COLUMNS as readonly string[]).not.toContain(column)
    }
  })

  it('keeps Oxygen workload and free-form task columns out of MCP', () => {
    // Oxygen data is legally self-only; these columns feed it.
    expect(EXCLUDED_TASK_COLUMNS).toContain('expected_hours')
    expect(EXCLUDED_TASK_COLUMNS).toContain('difficulty')
    expect(EXCLUDED_TASK_COLUMNS).toContain('description')
  })
})

describe('every read is bounded', () => {
  it('caps the limit at 200 even when a larger one is requested', () => {
    const params = buildSelectParams({ columns: 'id', allowedColumns: ALLOWED, limit: 100000 })
    expect(params.get('limit')).toBe('200')
  })

  it('floors the limit at 1', () => {
    const params = buildSelectParams({ columns: 'id', allowedColumns: ALLOWED, limit: 0 })
    expect(params.get('limit')).toBe('1')
  })

  it('always sets a limit even when none is asked for', () => {
    const params = buildSelectParams({ columns: 'id', allowedColumns: ALLOWED })
    expect(params.get('limit')).toBeTruthy()
  })
})

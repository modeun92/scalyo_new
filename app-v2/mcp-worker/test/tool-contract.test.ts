// Tool contract: registers the real tools on a real McpServer with a stubbed database.
//
// The database stub here is NOT standing in for RLS — tenant isolation is proved against a
// live project in tenant-isolation.test.ts. This suite proves the things a stub CAN prove:
// that every tool registers against the actual SDK, that no tool accepts a tenant argument,
// that bounded limits hold, and that a read failure never becomes an empty result.

import { describe, it, expect, vi } from 'vitest'

import { McpServer } from '@modelcontextprotocol/server'
import { registerScalyoTools } from '../src/tools/index'
import type { ToolDeps } from '../src/tools/index'
import type { ScalyoUserContext } from '../src/auth/user-context'
import type { UserSupabaseClient } from '../src/supabase/user-client'
import type { Env } from '../src/env'
import { ScalyoMcpError } from '../src/errors'

const CONTEXT: ScalyoUserContext = {
  userId: 'user-a',
  email: 'a@example.com',
  organizationId: 'org-a',
  role: 'member',
  oauthClientId: 'client-1',
  requestId: 'req-1',
}

const allow = { limit: async () => ({ success: true }) }
const ENV = {
  MCP_RATE_LIMIT_IP: allow,
  MCP_RATE_LIMIT_USER: allow,
  MCP_RATE_LIMIT_HEAVY: allow,
} as unknown as Env

function deps(select: UserSupabaseClient['select']): ToolDeps {
  return { context: CONTEXT, db: { select }, env: ENV, environment: 'test' }
}

/** Captures what registerTool was called with, without a transport. */
function registerAndCapture(select: UserSupabaseClient['select']) {
  const server = new McpServer({ name: 'scalyo-test', version: '1.0.0' })
  const registered = new Map<string, { config: any; handler: (args: any) => Promise<any> }>()

  const spy = vi.spyOn(server, 'registerTool').mockImplementation(((name: string, config: any, handler: any) => {
    registered.set(name, { config, handler })
    return undefined as never
  }) as never)

  registerScalyoTools(server, deps(select))
  spy.mockRestore()
  return registered
}

const EMPTY: UserSupabaseClient['select'] = async () => []

function parse(result: any) {
  return JSON.parse(result.content[0].text)
}

describe('tool registration', () => {
  const tools = registerAndCapture(EMPTY)

  it('registers the v1 tool set', () => {
    expect([...tools.keys()].sort()).toEqual(
      [
        'fetch',
        'get_at_risk_clients',
        'get_client_overview',
        'get_my_tasks',
        'get_portfolio_summary',
        'get_server_status',
        'get_upcoming_renewals',
        'search',
        'search_clients',
      ].sort()
    )
  })

  it('registers no write tool', () => {
    const forbidden = ['delete_client', 'update_client', 'send_email', 'create_task', 'invite_member', 'change_subscription', 'create_quote']
    for (const name of forbidden) expect(tools.has(name)).toBe(false)
  })

  it('never accepts a tenant or identity argument (MCP-TENANT-SERVER-SIDE)', () => {
    for (const [name, { config }] of tools) {
      const fields = Object.keys(config.inputSchema || {})
      for (const banned of ['user_id', 'userId', 'organization_id', 'organizationId', 'role']) {
        expect(fields, name + ' must not accept ' + banned).not.toContain(banned)
      }
    }
  })

  it('never exposes a raw query parameter', () => {
    for (const [name, { config }] of tools) {
      const fields = Object.keys(config.inputSchema || {})
      for (const banned of ['sql', 'where', 'filter', 'postgrest_query', 'order_expression', 'rpc_name', 'select']) {
        expect(fields, name + ' must not accept ' + banned).not.toContain(banned)
      }
    }
  })

  it('describes every tool precisely enough for a model to choose it', () => {
    for (const [name, { config }] of tools) {
      expect(config.description, name + ' needs a description').toBeTruthy()
      // "Gets client data." is the anti-example in the gap plan, Rule 2.
      expect(config.description.length, name + ' description is too vague').toBeGreaterThan(60)
      expect(config.description, name + ' must state it is read-only').toContain('Read-only.')
    }
  })
})

describe('tool behaviour', () => {
  it('get_server_status reports the authenticated identity', async () => {
    const tools = registerAndCapture(EMPTY)
    const payload = parse(await tools.get('get_server_status')!.handler({}))
    expect(payload.authenticatedUser.userId).toBe('user-a')
    expect(payload.readOnly).toBe(true)
  })

  it('a database failure surfaces as an error, never as an empty portfolio (R21)', async () => {
    const failing: UserSupabaseClient['select'] = async () => {
      throw new ScalyoMcpError('UPSTREAM_UNAVAILABLE', 'clients returned 500')
    }
    const tools = registerAndCapture(failing)
    const result = await tools.get('get_portfolio_summary')!.handler({})

    expect(result.isError).toBe(true)
    const payload = parse(result)
    expect(payload.error).toBe('UPSTREAM_UNAVAILABLE')
    // The crucial bit: it must not have returned clientCount: 0.
    expect(payload.clientCount).toBeUndefined()
    expect(JSON.stringify(payload)).not.toContain('500')
  })

  it('excludes prospects from the portfolio aggregate', async () => {
    const rows = [
      { id: '1', name: 'Customer', health: 8, status: null, arr: 1000, mrr: null, renewal_date: null, lifecycle: 'client', churn_risk: null },
      { id: '2', name: 'Prospect', health: 2, status: null, arr: 50000, mrr: null, renewal_date: null, lifecycle: 'prospect', churn_risk: null },
    ]
    const select: UserSupabaseClient['select'] = async (table) => (table === 'clients' ? (rows as never[]) : [])
    const tools = registerAndCapture(select)
    const payload = parse(await tools.get('get_portfolio_summary')!.handler({}))

    expect(payload.clientCount).toBe(1)
    expect(payload.prospectsExcluded).toBe(1)
    expect(payload.totalArr).toBe(1000) // the prospect's 50000 must not be counted
    expect(payload.healthDistribution.critical).toBe(0)
  })

  it('counts an account with no ARR separately instead of summing it as zero', async () => {
    const rows = [
      { id: '1', name: 'Known', health: 8, status: null, arr: 1000, mrr: null, renewal_date: null, lifecycle: 'client', churn_risk: null },
      { id: '2', name: 'Unknown', health: 8, status: null, arr: null, mrr: null, renewal_date: null, lifecycle: 'client', churn_risk: null },
    ]
    const select: UserSupabaseClient['select'] = async (table) => (table === 'clients' ? (rows as never[]) : [])
    const tools = registerAndCapture(select)
    const payload = parse(await tools.get('get_portfolio_summary')!.handler({}))

    expect(payload.totalArr).toBe(1000)
    expect(payload.clientsWithoutArr).toBe(1)
  })

  it('refuses organization-scoped tools for a user with no membership', async () => {
    const server = new McpServer({ name: 't', version: '1' })
    const registered = new Map<string, any>()
    const spy = vi.spyOn(server, 'registerTool').mockImplementation(((n: string, c: any, h: any) => {
      registered.set(n, h)
      return undefined as never
    }) as never)
    registerScalyoTools(server, {
      context: { ...CONTEXT, organizationId: null, role: null },
      db: { select: EMPTY },
      env: ENV,
      environment: 'test',
    })
    spy.mockRestore()

    const result = await registered.get('search_clients')({ limit: 10 })
    expect(result.isError).toBe(true)
    expect(parse(result).error).toBe('FORBIDDEN')
  })

  it('rate limits a heavy tool without leaking the limiter internals', async () => {
    const server = new McpServer({ name: 't', version: '1' })
    const registered = new Map<string, any>()
    const spy = vi.spyOn(server, 'registerTool').mockImplementation(((n: string, c: any, h: any) => {
      registered.set(n, h)
      return undefined as never
    }) as never)
    registerScalyoTools(server, {
      context: CONTEXT,
      db: { select: EMPTY },
      env: { ...ENV, MCP_RATE_LIMIT_HEAVY: { limit: async () => ({ success: false }) } } as unknown as Env,
      environment: 'test',
    })
    spy.mockRestore()

    const result = await registered.get('get_portfolio_summary')({})
    expect(result.isError).toBe(true)
    expect(parse(result).error).toBe('RATE_LIMITED')
    expect(JSON.stringify(parse(result))).not.toContain('user-a')
  })

  it('search returns id/title/url triples for connector clients', async () => {
    const rows = [{ id: 'c1', name: 'Acme', health: 8, status: null, arr: 1, mrr: null, renewal_date: null, lifecycle: 'client', churn_risk: null }]
    const select: UserSupabaseClient['select'] = async (table) => (table === 'clients' ? (rows as never[]) : [])
    const tools = registerAndCapture(select)
    const payload = parse(await tools.get('search')!.handler({ query: 'Acme' }))

    expect(payload.results).toHaveLength(1)
    expect(payload.results[0]).toMatchObject({ id: 'c1', title: 'Acme' })
    expect(payload.results[0].url).toContain('c1')
  })

  it('get_client_overview says which fields are withheld rather than implying they are empty', async () => {
    const rows = [{ id: 'c1', name: 'Acme', health: 8, status: null, arr: 1, mrr: null, renewal_date: null, lifecycle: 'client', churn_risk: null }]
    const select: UserSupabaseClient['select'] = async () => rows as never[]
    const tools = registerAndCapture(select)
    const payload = parse(await tools.get('get_client_overview')!.handler({ clientId: '00000000-0000-4000-8000-000000000001' }))

    expect(payload.omittedFields.fields).toContain('contacts')
    expect(payload.omittedFields.fields).toContain('notes')
  })
})

describe('the real SDK accepts every tool definition', () => {
  // The suites above spy on registerTool, which proves what we passed but not that the SDK
  // accepts it. This one registers for real: a malformed zod shape or a bad tool config
  // throws here rather than at the first live tools/list.
  it('registers against an unmocked McpServer without throwing', () => {
    const server = new McpServer({ name: 'scalyo', version: '1.0.0' })
    expect(() => registerScalyoTools(server, deps(EMPTY))).not.toThrow()
  })
})

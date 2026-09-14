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
  organizationSource: 'profile',
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

  it('gives every tool a human title (MCP-TOOL-ANNOTATIONS)', () => {
    for (const [name, { config }] of tools) {
      expect(config.title, name + ' needs a title').toBeTruthy()
      expect(config.annotations?.title, name + ' needs an annotation title').toBeTruthy()
    }
  })

  it('declares every v1 tool read-only rather than leaving a host to guess', () => {
    for (const [name, { config }] of tools) {
      expect(config.annotations?.readOnlyHint, name + ' must declare readOnlyHint').toBe(true)
      expect(config.annotations?.destructiveHint, name + ' must declare destructiveHint').toBe(false)
      expect(config.annotations?.openWorldHint, name + ' must declare openWorldHint').toBe(false)
    }
  })

  it('declares an output schema for every tool', () => {
    for (const [name, { config }] of tools) {
      expect(config.outputSchema, name + ' needs an outputSchema').toBeTruthy()
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
  it('get_server_status returns no identifiers and no personal data (MCP-STATUS-MINIMAL)', async () => {
    const tools = registerAndCapture(EMPTY)
    const result = await tools.get('get_server_status')!.handler({})
    const payload = parse(result)

    expect(payload.connected).toBe(true)
    expect(payload.readOnly).toBe(true)
    expect(payload.role).toBe('member')
    expect(payload.organizationConnected).toBe(true)

    // Everything identifying stays in the audit log, not in a chat transcript that
    // leaves the EU. The email is personal data and went out in the third review (§8).
    const serialized = JSON.stringify(payload)
    expect(serialized).not.toContain('user-a')
    expect(serialized).not.toContain('org-a')
    expect(serialized).not.toContain('req-1')
    expect(serialized).not.toContain('a@example.com')
    expect(payload.account).toBeUndefined()
  })

  it('connector results deep-link to the real Vue route, not a 404 (MCP-CLIENT-URL)', async () => {
    const rows = [{ id: 'c1', name: 'Acme', health: 8, status: null, arr: 1, mrr: null, renewal_date: null, lifecycle: 'client', churn_risk: null }]
    const select: UserSupabaseClient['select'] = async () => rows as never[]
    const tools = registerAndCapture(select)

    const searched = parse(await tools.get('search')!.handler({ query: 'Acme' }))
    const fetched = parse(await tools.get('fetch')!.handler({ id: '00000000-0000-4000-8000-000000000001' }))

    // The authenticated area is mounted at /app (router/index.js). /clients/<id> 404s in
    // the user's browser, where no tool call would ever have reported it.
    for (const url of [searched.results[0].url, fetched.url]) {
      expect(url).toBe('https://scalyo.app/app/clients/c1')
      expect(url).not.toMatch(/scalyo\.app\/clients\//)
    }
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

  it('returns structuredContent that matches the declared output schema', async () => {
    const rows = [
      { id: 'c1', name: 'Acme', health: 3, status: null, arr: 1000, mrr: null, renewal_date: null, lifecycle: 'client', churn_risk: null },
    ]
    const select: UserSupabaseClient['select'] = async (table) => (table === 'clients' ? (rows as never[]) : [])
    const tools = registerAndCapture(select)

    for (const name of ['get_portfolio_summary', 'get_at_risk_clients', 'search_clients', 'get_my_tasks']) {
      const { config, handler } = tools.get(name)!
      const result = await handler({ limit: 10, withinDays: 30, overdueOnly: false, includeDone: false })

      expect(result.isError, name + ' should have succeeded').toBeFalsy()
      expect(result.structuredContent, name + ' must return structuredContent').toBeTruthy()
      // The text block is the fallback, and it must agree with the structured payload.
      expect(JSON.parse(result.content[0].text)).toEqual(result.structuredContent)
      // The SDK validates this at call time in production; asserting it here means a
      // payload/schema drift fails in CI rather than at a customer's first tool call.
      expect(config.outputSchema.safeParse(result.structuredContent).success, name + ' payload must satisfy its schema').toBe(true)
    }
  })

  it('an error result carries no structuredContent (it must not look like data)', async () => {
    const failing: UserSupabaseClient['select'] = async () => {
      throw new ScalyoMcpError('UPSTREAM_UNAVAILABLE', 'clients returned 500')
    }
    const tools = registerAndCapture(failing)
    const result = await tools.get('get_portfolio_summary')!.handler({})

    expect(result.isError).toBe(true)
    expect(result.structuredContent).toBeUndefined()
  })

  it('flags a scan that hit its ceiling as partial, not merely truncated (MCP-PARTIAL-HONEST)', async () => {
    // 200 rows back = the scan ceiling. Accounts beyond it were never fetched, so the
    // answer is incomplete — a different statement from "more matched than your limit".
    const full = Array.from({ length: 200 }, (_, i) => ({
      id: 'c' + i, name: 'Client ' + i, health: 2, status: null, arr: 100, mrr: null,
      renewal_date: null, lifecycle: 'client', churn_risk: null,
    }))
    const select: UserSupabaseClient['select'] = async (table) => (table === 'clients' ? (full as never[]) : [])
    const tools = registerAndCapture(select)

    const atRisk = parse(await tools.get('get_at_risk_clients')!.handler({ limit: 10 }))
    expect(atRisk.partial).toBe(true)
    expect(atRisk.partialNote).toContain('200')
    expect(atRisk.truncated).toBe(true) // both are true here, and they mean different things
    expect(atRisk.scannedClients).toBe(200)
  })

  it('does not claim partial when the whole result fitted inside the scan', async () => {
    const few = [
      { id: 'c1', name: 'Acme', health: 2, status: null, arr: 100, mrr: null, renewal_date: null, lifecycle: 'client', churn_risk: null },
    ]
    const select: UserSupabaseClient['select'] = async (table) => (table === 'clients' ? (few as never[]) : [])
    const tools = registerAndCapture(select)

    const atRisk = parse(await tools.get('get_at_risk_clients')!.handler({ limit: 10 }))
    expect(atRisk.partial).toBe(false)
    expect(atRisk.partialNote).toBeNull()
    expect(atRisk.truncated).toBe(false)

    // R21: a complete empty answer must not read as partial either.
    const empty = registerAndCapture(EMPTY)
    const none = parse(await empty.get('get_at_risk_clients')!.handler({ limit: 10 }))
    expect(none.partial).toBe(false)
    expect(none.count).toBe(0)
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

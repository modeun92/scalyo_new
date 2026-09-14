// Cross-tenant isolation — REAL integration test against a live pre-production project.
//
// MCP-ISOLATION-REAL (14/09/2026): this suite deliberately has no mocks. A mocked
// Supabase would prove that our fake returns what we told it to, which is exactly the
// class of false signal docs/MOCK_CODE_AUDIT.md exists to catch — and "cross-tenant
// isolation verified" is the worst possible thing to be wrong about.
//
// It therefore SKIPS when credentials are absent, and prints why. A skipped run is not a
// pass: the release checklist in docs/MCP_SERVER.md requires this suite to have RUN
// against pre-production before a production deploy.
//
// Required environment (pre-production project, two throwaway accounts in two orgs):
//   SCALYO_TEST_SUPABASE_URL
//   SCALYO_TEST_SUPABASE_ANON_KEY
//   SCALYO_TEST_ORG_A_TOKEN     access token for a user in organization A
//   SCALYO_TEST_ORG_A_CLIENT_ID a client id owned by organization A
//   SCALYO_TEST_ORG_B_TOKEN     access token for a user in organization B
//   SCALYO_TEST_ORG_B_CLIENT_ID a client id owned by organization B
//
// Never point these at production.

import { describe, it, expect } from 'vitest'

import { createUserScopedSupabaseClient } from '../src/supabase/user-client'
import { getClientOverview, searchClients } from '../src/services/clients.service'
import { getMyTasks } from '../src/services/tasks.service'
import { ScalyoMcpError } from '../src/errors'
import { verifyAccessToken } from '../src/auth/verify-token'
import { resolveUserContext } from '../src/auth/user-context'

const ENV = {
  url: process.env.SCALYO_TEST_SUPABASE_URL,
  anonKey: process.env.SCALYO_TEST_SUPABASE_ANON_KEY,
  tokenA: process.env.SCALYO_TEST_ORG_A_TOKEN,
  clientA: process.env.SCALYO_TEST_ORG_A_CLIENT_ID,
  tokenB: process.env.SCALYO_TEST_ORG_B_TOKEN,
  clientB: process.env.SCALYO_TEST_ORG_B_CLIENT_ID,
}

const configured = Object.values(ENV).every(Boolean)

if (!configured) {
  const missing = Object.entries(ENV).filter(([, v]) => !v).map(([k]) => k)
  console.warn(
    '\n[tenant-isolation] SKIPPED — missing: ' + missing.join(', ') +
    '\n[tenant-isolation] A skipped run is NOT a pass. Run this against pre-production before deploying MCP.\n'
  )
}

const config = {
  supabaseUrl: (ENV.url || '').replace(/\/+$/, ''),
  supabaseAnonKey: ENV.anonKey || '',
  environment: 'test',
  enabled: true,
}

describe.skipIf(!configured)('cross-tenant isolation (live pre-production)', () => {
  const dbA = () => createUserScopedSupabaseClient(config, ENV.tokenA!)
  const dbB = () => createUserScopedSupabaseClient(config, ENV.tokenB!)

  it('user A can read their own client', async () => {
    const client = await getClientOverview(dbA(), ENV.clientA!)
    expect(client.id).toBe(ENV.clientA)
  })

  it('user A cannot read organization B\'s client by its known UUID', async () => {
    // The id is real and valid — only RLS stands between A and it.
    await expect(getClientOverview(dbA(), ENV.clientB!)).rejects.toThrow(ScalyoMcpError)
    await expect(getClientOverview(dbA(), ENV.clientB!)).rejects.toMatchObject({ code: 'NOT_FOUND' })
  })

  it('user B cannot read organization A\'s client by its known UUID', async () => {
    await expect(getClientOverview(dbB(), ENV.clientA!)).rejects.toMatchObject({ code: 'NOT_FOUND' })
  })

  it('search_clients never returns the other organization\'s accounts', async () => {
    const [resultA, resultB] = await Promise.all([
      searchClients(dbA(), { limit: 50 }),
      searchClients(dbB(), { limit: 50 }),
    ])

    const idsA = new Set(resultA.clients.map((c) => c.id))
    const idsB = new Set(resultB.clients.map((c) => c.id))

    expect(idsA.has(ENV.clientB!)).toBe(false)
    expect(idsB.has(ENV.clientA!)).toBe(false)
    // The two portfolios must not overlap at all.
    expect([...idsA].filter((id) => idsB.has(id))).toEqual([])
  })

  it('a filter injection attempt in the query argument cannot widen the result set', async () => {
    const honest = await searchClients(dbA(), { limit: 50 })
    const hostile = await searchClients(dbA(), { query: '%,id.eq.' + ENV.clientB, limit: 50 })

    expect(hostile.clients.map((c) => c.id)).not.toContain(ENV.clientB)
    expect(hostile.count).toBeLessThanOrEqual(honest.count)
  })

  it('get_my_tasks returns only the caller\'s own tasks', async () => {
    const [tasksA, tasksB] = await Promise.all([
      getMyTasks(dbA(), (await verifyAccessToken(config, ENV.tokenA!)).userId, { overdueOnly: false, includeDone: true, limit: 50 }),
      getMyTasks(dbB(), (await verifyAccessToken(config, ENV.tokenB!)).userId, { overdueOnly: false, includeDone: true, limit: 50 }),
    ])

    const idsA = new Set(tasksA.tasks.map((t) => t.id))
    expect(tasksB.tasks.filter((t) => idsA.has(t.id))).toEqual([])
  })

  it('resolves each user into their own organization', async () => {
    const userA = await verifyAccessToken(config, ENV.tokenA!)
    const userB = await verifyAccessToken(config, ENV.tokenB!)

    const contextA = await resolveUserContext(config, dbA(), userA, 'test-a')
    const contextB = await resolveUserContext(config, dbB(), userB, 'test-b')

    expect(contextA.organizationId).toBeTruthy()
    expect(contextB.organizationId).toBeTruthy()
    expect(contextA.organizationId).not.toBe(contextB.organizationId)
  })
})

describe.skipIf(!configured)('token validity (live pre-production)', () => {
  it('rejects a syntactically valid but unsigned token', async () => {
    const fake = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJhdHRhY2tlciJ9.bm90LWEtc2lnbmF0dXJl'
    await expect(verifyAccessToken(config, fake)).rejects.toMatchObject({ code: 'UNAUTHENTICATED' })
  })

  it('rejects an empty token', async () => {
    await expect(verifyAccessToken(config, '')).rejects.toMatchObject({ code: 'UNAUTHENTICATED' })
  })
})

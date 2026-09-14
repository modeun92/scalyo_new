import { describe, it, expect } from 'vitest'

import { extractBearerToken, decodeTokenClaims, checkTokenBinding } from '../src/auth/verify-token'
import type { ScalyoMcpConfig } from '../src/env'
import { requireOrganization } from '../src/auth/user-context'
import type { ScalyoUserContext } from '../src/auth/user-context'
import { ScalyoMcpError, toSafePayload } from '../src/errors'
import { riskReasons, toClientSummary } from '../src/services/clients.service'
import { protectedResourceMetadata, authorizationServerIssuer } from '../src/auth/protected-resource'

const CONFIG: ScalyoMcpConfig = {
  supabaseUrl: 'https://example.supabase.co',
  supabaseAnonKey: 'anon',
  environment: 'test',
  enabled: true,
  resourceUrl: 'https://mcp.scalyo.app/mcp',
  tokenBinding: 'observe',
  allowedOauthClients: [],
}

function request(headers: Record<string, string>): Request {
  return new Request('https://mcp.scalyo.app/mcp', { headers })
}

describe('bearer token extraction', () => {
  it('accepts a well-formed header', () => {
    expect(extractBearerToken(request({ Authorization: 'Bearer abc.def.ghi' }))).toBe('abc.def.ghi')
  })

  it('is case-insensitive on the scheme', () => {
    expect(extractBearerToken(request({ Authorization: 'bearer abc' }))).toBe('abc')
  })

  it('returns null when the header is absent, empty or another scheme', () => {
    expect(extractBearerToken(request({}))).toBeNull()
    expect(extractBearerToken(request({ Authorization: 'Bearer ' }))).toBeNull()
    expect(extractBearerToken(request({ Authorization: 'Basic dXNlcjpwYXNz' }))).toBeNull()
  })
})

describe('tenant context fails closed', () => {
  const base: ScalyoUserContext = {
    userId: 'u1', email: null, organizationId: null, role: null, oauthClientId: null,
    organizationSource: null, requestId: 'r1',
  }

  it('refuses a user with no organization membership', () => {
    expect(() => requireOrganization(base)).toThrow(ScalyoMcpError)
    try {
      requireOrganization(base)
    } catch (error) {
      expect((error as ScalyoMcpError).code).toBe('FORBIDDEN')
    }
  })

  it('returns the organization when the membership exists', () => {
    expect(requireOrganization({ ...base, organizationId: 'org-a', role: 'member' })).toBe('org-a')
  })
})

describe('errors never leak internals', () => {
  it('keeps the internal detail out of the payload', () => {
    const error = new ScalyoMcpError('UPSTREAM_UNAVAILABLE', 'clients returned 500: relation "clients" does not exist')
    const payload = toSafePayload(error, 'req-1')
    expect(JSON.stringify(payload)).not.toContain('relation')
    expect(payload.error).toBe('UPSTREAM_UNAVAILABLE')
    expect(payload.requestId).toBe('req-1')
  })

  it('maps an unknown throw to INTERNAL_ERROR rather than echoing it', () => {
    const payload = toSafePayload(new Error('connect ECONNREFUSED 10.0.0.5:5432'), 'req-2')
    expect(payload.error).toBe('INTERNAL_ERROR')
    expect(JSON.stringify(payload)).not.toContain('10.0.0.5')
  })

  it('does not reveal whether a cross-tenant id exists', () => {
    expect(toSafePayload(new ScalyoMcpError('NOT_FOUND'), 'r').message).toBe(
      'The requested record is not available to this account.'
    )
  })
})

describe('risk reasons are machine tokens, not prose', () => {
  const reference = new Date('2026-09-14T12:00:00Z')

  it('flags a critical score', () => {
    expect(riskReasons({ id: 'c', name: 'A', health: 2, status: null, arr: 1, mrr: null, renewal_date: null, lifecycle: 'client', churn_risk: null }, reference))
      .toContain('critical_health')
  })

  it('flags an overdue renewal as overdue, never as upcoming', () => {
    const reasons = riskReasons(
      { id: 'c', name: 'A', health: 9, status: null, arr: 1, mrr: null, renewal_date: '2026-05-04', lifecycle: 'client', churn_risk: null },
      reference
    )
    expect(reasons).toContain('renewal_overdue')
    expect(reasons).not.toContain('renewal_within_30_days')
  })

  it('flags high churn risk only above the threshold', () => {
    const at = (churn: number) =>
      riskReasons({ id: 'c', name: 'A', health: 9, status: null, arr: 1, mrr: null, renewal_date: null, lifecycle: 'client', churn_risk: churn }, reference)
    expect(at(70)).toContain('high_churn_risk')
    expect(at(69)).not.toContain('high_churn_risk')
    expect(at(0)).not.toContain('high_churn_risk')
  })

  it('returns no reasons for a healthy account', () => {
    expect(riskReasons({ id: 'c', name: 'A', health: 9, status: 'healthy', arr: 1, mrr: null, renewal_date: null, lifecycle: 'client', churn_risk: 10 }, reference))
      .toEqual([])
  })
})

describe('client summary reports missing data as null (R21)', () => {
  it('never substitutes a plausible number', () => {
    const summary = toClientSummary({
      id: 'c1', name: 'Unknown Co', health: null, status: null, arr: null, mrr: null,
      renewal_date: null, lifecycle: 'client', churn_risk: null,
    })
    expect(summary.health).toBeNull()
    expect(summary.arr).toBeNull()
    expect(summary.churnRisk).toBeNull()
    expect(summary.daysToRenewal).toBeNull()
    expect(summary.renewalOverdue).toBe(false)
  })
})

describe('OAuth discovery metadata', () => {
  it('points at Supabase as the authorization server', () => {
    expect(authorizationServerIssuer(CONFIG)).toBe('https://example.supabase.co/auth/v1')
  })

  it('advertises the MCP endpoint as the protected resource', () => {
    const metadata = protectedResourceMetadata(CONFIG, 'https://mcp.scalyo.app/mcp')
    expect(metadata.resource).toBe('https://mcp.scalyo.app/mcp')
    expect(metadata.authorization_servers).toEqual(['https://example.supabase.co/auth/v1'])
    expect(metadata.bearer_methods_supported).toContain('header')
  })
})

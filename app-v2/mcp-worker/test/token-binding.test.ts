// Resource binding and deterministic tenant context.
//
// These are the two production blockers from
// SCALYO_MCP_SECOND_REVIEW_AND_PRODUCTION_READINESS.md that live in this Worker's code.
// The third (restricting an AI token at the Supabase/RLS level) is a database change and
// cannot be proved from here — see docs/MCP_OPEN_QUESTIONS.md.

import { describe, it, expect } from 'vitest'

import { checkTokenBinding, decodeTokenClaims, verifyAccessToken } from '../src/auth/verify-token'
import { resolveUserContext } from '../src/auth/user-context'
import { canonicalResourceUrl } from '../src/auth/protected-resource'
import { getConfig, type Env, type ScalyoMcpConfig } from '../src/env'
import { ScalyoMcpError } from '../src/errors'
import type { UserSupabaseClient, SelectOptions } from '../src/supabase/user-client'

const RESOURCE = 'https://mcp.scalyo.app/mcp'

function config(overrides: Partial<ScalyoMcpConfig> = {}): ScalyoMcpConfig {
  return {
    supabaseUrl: 'https://example.supabase.co',
    supabaseAnonKey: 'anon',
    environment: 'test',
    enabled: true,
    resourceUrl: RESOURCE,
    tokenBinding: 'observe',
    allowedOauthClients: [],
    ...overrides,
  }
}

/** A JWT with a real, decodable payload. The signature is never checked here — the
 *  identity comes from /auth/v1/user, which is exactly why a fake one is safe in a test. */
function jwt(claims: Record<string, unknown>): string {
  const b64 = (value: unknown) =>
    btoa(JSON.stringify(value)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
  return b64({ alg: 'HS256', typ: 'JWT' }) + '.' + b64(claims) + '.signature'
}

const ISSUER = 'https://example.supabase.co/auth/v1'
const FUTURE = Math.floor(Date.now() / 1000) + 3600

describe('token claim decoding', () => {
  it('reads the payload of a well-formed JWT', () => {
    expect(decodeTokenClaims(jwt({ iss: ISSUER, client_id: 'c1' }))?.client_id).toBe('c1')
  })

  it('returns null rather than throwing on junk', () => {
    expect(decodeTokenClaims('not-a-jwt')).toBeNull()
    expect(decodeTokenClaims('a.!!!.c')).toBeNull()
    expect(decodeTokenClaims('')).toBeNull()
  })
})

describe('resource binding (MCP-RESOURCE-BINDING)', () => {
  it('accepts a token whose aud is this MCP resource', () => {
    const result = checkTokenBinding(config(), decodeTokenClaims(jwt({ iss: ISSUER, aud: RESOURCE, exp: FUTURE })), RESOURCE)
    expect(result.bound).toBe(true)
    expect(result.reasons).toEqual([])
  })

  it('accepts the RFC 8707 resource claim as well as aud', () => {
    const result = checkTokenBinding(
      config(),
      decodeTokenClaims(jwt({ iss: ISSUER, aud: 'authenticated', resource: RESOURCE, exp: FUTURE })),
      RESOURCE
    )
    expect(result.bound).toBe(true)
  })

  it('accepts an aud array containing this resource', () => {
    const result = checkTokenBinding(
      config(),
      decodeTokenClaims(jwt({ iss: ISSUER, aud: ['https://other.example/mcp', RESOURCE], exp: FUTURE })),
      RESOURCE
    )
    expect(result.bound).toBe(true)
  })

  it('ignores a trailing slash difference', () => {
    const result = checkTokenBinding(config(), decodeTokenClaims(jwt({ iss: ISSUER, aud: RESOURCE + '/', exp: FUTURE })), RESOURCE)
    expect(result.bound).toBe(true)
  })

  it('rejects a normal website session token — valid user, wrong audience', () => {
    const result = checkTokenBinding(config(), decodeTokenClaims(jwt({ iss: ISSUER, aud: 'authenticated', exp: FUTURE })), RESOURCE)
    expect(result.bound).toBe(false)
    expect(result.reasons).toContain('audience_mismatch')
  })

  it('rejects a token issued for another MCP resource', () => {
    const result = checkTokenBinding(
      config(),
      decodeTokenClaims(jwt({ iss: ISSUER, aud: 'https://mcp-preprod.scalyo.app/mcp', exp: FUTURE })),
      RESOURCE
    )
    expect(result.reasons).toContain('audience_mismatch')
  })

  it('rejects another project as the issuer', () => {
    const result = checkTokenBinding(
      config(),
      decodeTokenClaims(jwt({ iss: 'https://attacker.supabase.co/auth/v1', aud: RESOURCE, exp: FUTURE })),
      RESOURCE
    )
    expect(result.reasons).toContain('issuer_mismatch')
  })

  it('rejects an expired token', () => {
    const result = checkTokenBinding(
      config(),
      decodeTokenClaims(jwt({ iss: ISSUER, aud: RESOURCE, exp: Math.floor(Date.now() / 1000) - 10 })),
      RESOURCE
    )
    expect(result.reasons).toContain('expired')
  })

  it('rejects an unparseable token', () => {
    expect(checkTokenBinding(config(), decodeTokenClaims('garbage'), RESOURCE).reasons).toContain('unparseable_token')
  })

  it('enforces the OAuth client allowlist only when one is configured', () => {
    const claims = decodeTokenClaims(jwt({ iss: ISSUER, aud: RESOURCE, exp: FUTURE, client_id: 'unknown-client' }))
    expect(checkTokenBinding(config(), claims, RESOURCE).bound).toBe(true)
    expect(checkTokenBinding(config({ allowedOauthClients: ['chatgpt', 'claude'] }), claims, RESOURCE).reasons)
      .toContain('client_not_allowed')
    expect(checkTokenBinding(config({ allowedOauthClients: ['unknown-client'] }), claims, RESOURCE).bound).toBe(true)
  })

  it('skips the audience check when no resource is pinned, instead of inventing one', () => {
    // `wrangler dev`: MCP_RESOURCE_URL is empty. Pinning the check to whatever hostname
    // the request arrived on would make it trivially satisfiable, so it is skipped and
    // the issuer/expiry checks still apply.
    const result = checkTokenBinding(config({ resourceUrl: null }), decodeTokenClaims(jwt({ iss: ISSUER, aud: 'authenticated', exp: FUTURE })), null)
    expect(result.bound).toBe(true)
  })
})

describe('binding mode decides whether the verdict is acted on', () => {
  const wrongResource = jwt({ iss: ISSUER, aud: 'authenticated', exp: FUTURE })

  it('enforce rejects a wrong-resource token WITHOUT calling Supabase Auth', async () => {
    let calls = 0
    const originalFetch = globalThis.fetch
    globalThis.fetch = (async () => {
      calls++
      return new Response('{}', { status: 200 })
    }) as typeof fetch

    try {
      await expect(verifyAccessToken(config({ tokenBinding: 'enforce' }), wrongResource, RESOURCE)).rejects.toThrow(ScalyoMcpError)
      // Rejecting must be cheaper than accepting, or the rejection path is its own
      // amplification vector against our auth service.
      expect(calls).toBe(0)
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  it('observe serves the request and reports the verdict for the audit line', async () => {
    const originalFetch = globalThis.fetch
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ id: 'user-1', email: 'a@example.com' }), { status: 200 })) as typeof fetch

    try {
      const user = await verifyAccessToken(config({ tokenBinding: 'observe' }), wrongResource, RESOURCE)
      expect(user.userId).toBe('user-1')
      expect(user.binding.bound).toBe(false)
      expect(user.binding.reasons).toContain('audience_mismatch')
    } finally {
      globalThis.fetch = originalFetch
    }
  })
})

describe('the advertised resource and the validated resource are the same string', () => {
  it('uses MCP_RESOURCE_URL when set, whatever hostname the request arrived on', () => {
    expect(canonicalResourceUrl(config(), 'https://spoofed.example/mcp', '/mcp')).toBe(RESOURCE)
  })

  it('falls back to the request origin only when nothing is pinned', () => {
    expect(canonicalResourceUrl(config({ resourceUrl: null }), 'http://localhost:8787/mcp', '/mcp')).toBe('http://localhost:8787/mcp')
  })

  it('reads the mode fail-safe: an unrecognised value is observe, never enforce', () => {
    const env = { SUPABASE_URL: 'https://x.supabase.co', SUPABASE_ANON_KEY: 'k', MCP_TOKEN_BINDING: 'ENFORCE_MAYBE' } as unknown as Env
    expect(getConfig(env).tokenBinding).toBe('observe')
    expect(getConfig({ ...env, MCP_TOKEN_BINDING: 'enforce' } as unknown as Env).tokenBinding).toBe('enforce')
    expect(getConfig({ ...env, MCP_TOKEN_BINDING: 'ENFORCE' } as unknown as Env).tokenBinding).toBe('enforce')
  })

  it('parses the OAuth client allowlist tolerantly', () => {
    const env = { SUPABASE_URL: 'https://x.supabase.co', SUPABASE_ANON_KEY: 'k', MCP_ALLOWED_OAUTH_CLIENTS: ' a , b ,, ' } as unknown as Env
    expect(getConfig(env).allowedOauthClients).toEqual(['a', 'b'])
  })
})

// ---------------------------------------------------------------------------------------

const USER = { userId: 'u1', email: 'u1@example.com', oauthClientId: null, binding: { bound: true, reasons: [], claimedAudience: [] } }

/** Stub that answers per table, so a test can describe an inconsistent database. */
function stubDb(tables: Record<string, unknown[]>): UserSupabaseClient {
  return {
    select: (async (table: string, _options: SelectOptions) => tables[table] || []) as UserSupabaseClient['select'],
  }
}

describe('deterministic organization context (MCP-ORG-DETERMINISTIC)', () => {
  it('takes the organization from profiles, not from whichever membership row came back first', async () => {
    const db = stubDb({
      profiles: [{ organization_id: 'org-canonical', org_role: 'owner' }],
      organization_members: [
        { organization_id: 'org-other', role: 'member' },
        { organization_id: 'org-canonical', role: 'admin' },
      ],
    })
    const context = await resolveUserContext(config(), db, USER, 'r1')

    expect(context.organizationId).toBe('org-canonical')
    // The role comes from the membership row for THAT organization, not the first row.
    expect(context.role).toBe('admin')
    expect(context.organizationSource).toBe('profile')
  })

  it('refuses when profiles and organization_members disagree', async () => {
    const db = stubDb({
      profiles: [{ organization_id: 'org-a', org_role: 'owner' }],
      organization_members: [{ organization_id: 'org-b', role: 'member' }],
    })
    await expect(resolveUserContext(config(), db, USER, 'r1')).rejects.toThrow(ScalyoMcpError)
  })

  it('accepts the legacy owner with no membership row, using the profile role', async () => {
    const db = stubDb({ profiles: [{ organization_id: 'org-a', org_role: 'owner' }], organization_members: [] })
    const context = await resolveUserContext(config(), db, USER, 'r1')

    expect(context.organizationId).toBe('org-a')
    expect(context.role).toBe('owner')
  })

  it('uses a sole membership when the profile carries no organization', async () => {
    const db = stubDb({ profiles: [{ organization_id: null, org_role: null }], organization_members: [{ organization_id: 'org-a', role: 'member' }] })
    const context = await resolveUserContext(config(), db, USER, 'r1')

    expect(context.organizationId).toBe('org-a')
    expect(context.organizationSource).toBe('sole_membership')
  })

  it('refuses to guess between several memberships when the profile carries none', async () => {
    const db = stubDb({
      profiles: [{ organization_id: null, org_role: null }],
      organization_members: [{ organization_id: 'org-a', role: 'member' }, { organization_id: 'org-b', role: 'member' }],
    })
    await expect(resolveUserContext(config(), db, USER, 'r1')).rejects.toThrow(ScalyoMcpError)
  })

  it('gives no organization at all when there is nothing to derive one from', async () => {
    const context = await resolveUserContext(config(), stubDb({}), USER, 'r1')
    expect(context.organizationId).toBeNull()
    expect(context.role).toBeNull()
    expect(context.organizationSource).toBeNull()
  })

  it('treats an unrecognised role string as no role, never as a permissive default', async () => {
    const db = stubDb({
      profiles: [{ organization_id: 'org-a', org_role: 'superadmin' }],
      organization_members: [{ organization_id: 'org-a', role: 'superadmin' }],
    })
    expect((await resolveUserContext(config(), db, USER, 'r1')).role).toBeNull()
  })
})

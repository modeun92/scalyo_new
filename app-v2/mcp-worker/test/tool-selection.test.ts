// Integrity of the golden-prompt evaluation set.
//
// MCP-TOOL-SELECTION-EVAL (14/09/2026): this suite calls NO model. It proves the eval set
// still describes the tools that actually exist, which is the failure that would otherwise
// go unnoticed: rename a tool, and every case naming the old name silently starts asserting
// nothing — the eval file goes green by describing a server that no longer exists.
//
// The live model run (routing accuracy >= threshold) is a separate, nightly/pre-release
// job. A passing integrity check is NOT a passing evaluation; see docs/MCP_SERVER.md.

import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { McpServer } from '@modelcontextprotocol/server'
import { registerScalyoTools } from '../src/tools/index'
import type { ToolDeps } from '../src/tools/index'
import type { ScalyoUserContext } from '../src/auth/user-context'
import type { Env } from '../src/env'

interface GoldenCase {
  id: string
  prompt: string
  expectedTools: string[]
  forbiddenTools?: string[]
  anyOrder?: boolean
  note?: string
}

interface GoldenSet {
  version: number
  threshold: number
  cases: GoldenCase[]
}

const golden = JSON.parse(
  readFileSync(fileURLToPath(new URL('./evals/golden-prompts.json', import.meta.url)), 'utf-8')
) as GoldenSet

const CONTEXT: ScalyoUserContext = {
  userId: 'user-a',
  email: 'a@example.com',
  organizationId: 'org-a',
  role: 'member',
  oauthClientId: null,
  organizationSource: 'profile',
  requestId: 'req-1',
}

const allow = { limit: async () => ({ success: true }) }
const ENV = { MCP_RATE_LIMIT_IP: allow, MCP_RATE_LIMIT_USER: allow, MCP_RATE_LIMIT_HEAVY: allow } as unknown as Env

/** The names the server actually registers, read from the registry rather than a list. */
function registeredToolNames(): Set<string> {
  const server = new McpServer({ name: 'scalyo-test', version: '1.0.0' })
  const names = new Set<string>()
  const spy = vi.spyOn(server, 'registerTool').mockImplementation(((name: string) => {
    names.add(name)
    return undefined as never
  }) as never)

  const deps: ToolDeps = { context: CONTEXT, db: { select: async () => [] }, env: ENV, environment: 'test' }
  registerScalyoTools(server, deps)
  spy.mockRestore()
  return names
}

describe('golden-prompt set integrity', () => {
  const tools = registeredToolNames()

  it('is a non-empty, versioned set with a routing threshold', () => {
    expect(golden.version).toBeGreaterThan(0)
    expect(golden.threshold).toBeGreaterThan(0.5)
    expect(golden.threshold).toBeLessThanOrEqual(1)
    expect(golden.cases.length).toBeGreaterThan(0)
  })

  it('gives every case a unique id and a prompt', () => {
    const ids = golden.cases.map((c) => c.id)
    expect(new Set(ids).size, 'case ids must be unique').toBe(ids.length)
    for (const c of golden.cases) expect(c.prompt.trim().length, c.id + ' needs a prompt').toBeGreaterThan(0)
  })

  it('names only tools that actually exist (a rename must break this, loudly)', () => {
    for (const c of golden.cases) {
      for (const name of c.expectedTools) {
        expect(tools.has(name), c.id + ' expects "' + name + '", which is not a registered tool').toBe(true)
      }
    }
  })

  it('names only NON-existent tools in forbiddenTools (the day one exists, this must fail)', () => {
    for (const c of golden.cases) {
      for (const name of c.forbiddenTools || []) {
        // If a write tool is ever added with one of these names, this assertion fires and
        // forces the eval set — and the consent copy — to be revisited deliberately.
        expect(tools.has(name), c.id + ' forbids "' + name + '", but it is now registered').toBe(false)
      }
    }
  })

  it('keeps negative cases negative', () => {
    const negatives = golden.cases.filter((c) => c.id.startsWith('negative-'))
    expect(negatives.length, 'a set with no negative cases cannot detect over-triggering').toBeGreaterThan(2)
    for (const c of negatives) {
      expect(c.expectedTools, c.id + ' is a negative case and must expect no tool').toEqual([])
    }
  })

  it('covers every registered business tool at least once', () => {
    // The connector pair (search/fetch) is host-contract surface, not something a model
    // picks from a natural-language prompt, so it is exempt.
    const exempt = new Set(['search', 'fetch', 'get_server_status'])
    const covered = new Set(golden.cases.flatMap((c) => c.expectedTools))

    for (const name of tools) {
      if (exempt.has(name)) continue
      expect(covered.has(name), name + ' has no golden prompt — its routing is unevaluated').toBe(true)
    }
  })
})

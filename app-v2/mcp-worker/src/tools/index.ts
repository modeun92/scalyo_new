// Scalyo MCP tool registry.
//
// MCP-TOOLS-GOAL-SHAPED (14/09/2026): these are Customer Success goals, not table
// wrappers. `get_at_risk_clients` is worth far more to an assistant than a `list_clients`
// that makes the model invent its own definition of risk — and a model that invents the
// definition will disagree with the Scalyo UI in front of the customer.
//
// v1 is READ-ONLY. No tool writes. The write set (add_client_note, create_task,
// update_task_status, ...) waits until the read surface has production telemetry.
//
// Every tool:
//   - takes NO user_id / organization_id / role argument (see auth/user-context.ts);
//   - has a strict zod schema with bounded limits;
//   - returns JSON text, so the model formats the prose and we never ship a sentence
//     we would have to translate (rule 4 — no hard-coded translation lives here);
//   - is wrapped by runTool() for audit, rate limiting and safe error mapping.

import type { McpServer } from '@modelcontextprotocol/server'
import { z } from 'zod'

import { ScalyoMcpError, toSafePayload, internalDetailOf } from '../errors'
import { audit, now } from '../audit/mcp-audit'
import type { ScalyoUserContext } from '../auth/user-context'
import { requireOrganization } from '../auth/user-context'
import type { UserSupabaseClient } from '../supabase/user-client'
import type { Env } from '../env'
import { getPortfolioSummary } from '../services/portfolio.service'
import { getMyTasks } from '../services/tasks.service'
import {
  searchClients,
  getClientOverview,
  getAtRiskClients,
  getUpcomingRenewals,
} from '../services/clients.service'

export interface ToolDeps {
  context: ScalyoUserContext
  db: UserSupabaseClient
  env: Env
  environment: string
}

interface ToolResult {
  // The SDK v2 result type carries an open index signature (`_meta` and friends). Without
  // it here the object is not assignable to the registerTool callback return type.
  [key: string]: unknown
  content: Array<{ type: 'text'; text: string }>
  isError?: boolean
}

function json(value: unknown): ToolResult {
  return { content: [{ type: 'text', text: JSON.stringify(value, null, 2) }] }
}

/**
 * Wraps every tool call: heavy-tool rate limit, audit start/finish, safe error mapping.
 *
 * A failure returns isError with a category and the requestId — never a stack, never a
 * PostgREST body (MCP-ERR-OPAQUE).
 */
async function runTool(
  deps: ToolDeps,
  toolName: string,
  options: { heavy?: boolean },
  work: () => Promise<{ payload: unknown; resultCount?: number }>
): Promise<ToolResult> {
  const started = now()
  const { requestId, userId, organizationId, role, oauthClientId } = deps.context
  const base = { requestId, userId, organizationId, role, oauthClientId, tool: toolName }

  audit('mcp.tool.started', base)

  try {
    if (options.heavy) {
      // Portfolio aggregations read the whole client page on every call — they get their
      // own, much tighter namespace so one chatty assistant cannot exhaust the account.
      const { success } = await deps.env.MCP_RATE_LIMIT_HEAVY.limit({ key: 'heavy:' + userId })
      if (!success) throw new ScalyoMcpError('RATE_LIMITED', 'heavy tool limit for user ' + userId)
    }

    const { payload, resultCount } = await work()
    audit('mcp.tool.completed', { ...base, success: true, durationMs: now() - started, resultCount })
    return json(payload)
  } catch (error) {
    const code = error instanceof ScalyoMcpError ? error.code : 'INTERNAL_ERROR'
    audit(code === 'RATE_LIMITED' ? 'mcp.tool.rate_limited' : code === 'FORBIDDEN' ? 'mcp.tool.denied' : 'mcp.tool.completed', {
      ...base,
      success: false,
      durationMs: now() - started,
      errorCode: code,
      detail: internalDetailOf(error),
    })
    return { ...json(toSafePayload(error, requestId)), isError: true }
  }
}

// Bounded primitives reused across schemas. Rule 3 of the gap plan: default 10, max 50.
const limitSchema = z.number().int().min(1).max(50).default(10)
const uuidSchema = z.string().uuid()
const querySchema = z.string().min(1).max(100)
const isoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected YYYY-MM-DD')

export function registerScalyoTools(server: McpServer, deps: ToolDeps): void {
  // ---------------------------------------------------------------- diagnostics

  server.registerTool(
    'get_server_status',
    {
      description:
        'Returns the Scalyo MCP server status and the identity of the connected Scalyo user. ' +
        'Use this to confirm the connection works and to see which Scalyo account and organization the other tools will read. Read-only.',
      inputSchema: {},
    },
    async () =>
      runTool(deps, 'get_server_status', {}, async () => ({
        payload: {
          server: 'scalyo-mcp',
          version: '1.0.0',
          environment: deps.environment,
          readOnly: true,
          authenticatedUser: {
            userId: deps.context.userId,
            email: deps.context.email,
            organizationId: deps.context.organizationId,
            role: deps.context.role,
          },
          requestId: deps.context.requestId,
        },
      }))
  )

  // ---------------------------------------------------------------- portfolio

  server.registerTool(
    'get_portfolio_summary',
    {
      description:
        'Returns the high-level state of the Customer Success portfolio visible to the authenticated Scalyo user: ' +
        'number of active accounts, total ARR, ARR at risk, average health score out of 10, the critical/watch/healthy ' +
        'distribution, renewals due in the next 30 days, overdue renewals, and the user\'s overdue tasks. ' +
        'Prospects are excluded from all figures. Read-only.',
      inputSchema: {},
    },
    async () =>
      runTool(deps, 'get_portfolio_summary', { heavy: true }, async () => {
        requireOrganization(deps.context)
        return { payload: await getPortfolioSummary(deps.db, deps.context.userId) }
      })
  )

  server.registerTool(
    'get_at_risk_clients',
    {
      description:
        'Returns the customer accounts visible to the authenticated Scalyo user that currently require attention, ' +
        'ranked by severity then ARR. An account is at risk when its effective health status is critical or watch, ' +
        'its renewal is overdue or near, or its churn risk is high. Each account carries machine-readable riskReasons. ' +
        'Prospects are excluded. Read-only.',
      inputSchema: { limit: limitSchema },
    },
    async ({ limit }) =>
      runTool(deps, 'get_at_risk_clients', { heavy: true }, async () => {
        requireOrganization(deps.context)
        const result = await getAtRiskClients(deps.db, limit)
        return { payload: result, resultCount: result.count }
      })
  )

  server.registerTool(
    'get_upcoming_renewals',
    {
      description:
        'Returns customer accounts whose contract renewal falls within the next N days, earliest first. ' +
        'Strictly future-dated: renewals already past are NOT included here — those are reported by get_at_risk_clients ' +
        'with the renewal_overdue reason. Prospects are excluded. Read-only.',
      inputSchema: {
        withinDays: z.number().int().min(1).max(365).default(30),
        limit: limitSchema,
      },
    },
    async ({ withinDays, limit }) =>
      runTool(deps, 'get_upcoming_renewals', {}, async () => {
        requireOrganization(deps.context)
        const result = await getUpcomingRenewals(deps.db, withinDays, limit)
        return { payload: result, resultCount: result.count }
      })
  )

  // ---------------------------------------------------------------- clients

  server.registerTool(
    'search_clients',
    {
      description:
        'Searches the customer accounts visible to the authenticated Scalyo user by name, and optionally filters by ' +
        'effective health status, lifecycle stage, or renewal date. Returns a bounded summary per account including ' +
        'health out of 10, ARR, renewal date and risk reasons. Use get_client_overview for a single account in detail. Read-only.',
      inputSchema: {
        query: querySchema.optional().describe('Case-insensitive fragment of the account name.'),
        status: z.enum(['critical', 'watch', 'healthy']).optional().describe('Effective health status: the worst of the score and the entered status.'),
        lifecycle: z.enum(['client', 'prospect']).optional(),
        renewalBefore: isoDateSchema.optional().describe('Only accounts renewing on or before this date (YYYY-MM-DD).'),
        limit: limitSchema,
      },
    },
    async (args) =>
      runTool(deps, 'search_clients', {}, async () => {
        requireOrganization(deps.context)
        const result = await searchClients(deps.db, {
          query: args.query,
          status: args.status,
          lifecycle: args.lifecycle,
          renewalBefore: args.renewalBefore,
          limit: args.limit,
        })
        return { payload: result, resultCount: result.count }
      })
  )

  server.registerTool(
    'get_client_overview',
    {
      description:
        'Returns a detailed summary of one customer account by its Scalyo id: name, industry, lifecycle, ARR and MRR, ' +
        'health score out of 10, effective status, churn risk, NPS, renewal date and assigned CSM. ' +
        'Contacts and free-form notes are never returned. Read-only.',
      inputSchema: { clientId: uuidSchema.describe('The Scalyo client id, as returned by search_clients.') },
    },
    async ({ clientId }) =>
      runTool(deps, 'get_client_overview', {}, async () => {
        requireOrganization(deps.context)
        return { payload: await getClientOverview(deps.db, clientId), resultCount: 1 }
      })
  )

  // ---------------------------------------------------------------- work

  server.registerTool(
    'get_my_tasks',
    {
      description:
        'Returns the Customer Success tasks assigned to the authenticated Scalyo user, earliest due date first, ' +
        'each flagged as overdue or not. Only the signed-in user\'s own tasks are returned, never a teammate\'s. Read-only.',
      inputSchema: {
        overdueOnly: z.boolean().default(false),
        includeDone: z.boolean().default(false),
        limit: limitSchema,
      },
    },
    async ({ overdueOnly, includeDone, limit }) =>
      runTool(deps, 'get_my_tasks', {}, async () => {
        const result = await getMyTasks(deps.db, deps.context.userId, { overdueOnly, includeDone, limit })
        return { payload: result, resultCount: result.count }
      })
  )

  registerChatGptCompatibilityTools(server, deps)
}

/**
 * CHATGPT-COMPAT (14/09/2026): ChatGPT's connector surface expects a generic `search`
 * returning {id,title,url} results and a `fetch` returning one document by id. The
 * business tools above are the real API; these two are a thin adapter over them so the
 * same endpoint installs cleanly in both Claude and ChatGPT.
 *
 * They add NO new data access — `search` is search_clients, `fetch` is
 * get_client_overview, both through the same RLS-scoped client and the same column
 * allowlists. Verify the exact contract against OpenAI's current connector documentation
 * before publication; it has changed before.
 */
function registerChatGptCompatibilityTools(server: McpServer, deps: ToolDeps): void {
  server.registerTool(
    'search',
    {
      description:
        'Searches Scalyo customer accounts visible to the authenticated user and returns matching records as ' +
        'id/title/url results. Generic entry point for connector clients; prefer search_clients or ' +
        'get_at_risk_clients when available, as they return richer Customer Success fields. Read-only.',
      inputSchema: { query: querySchema },
    },
    async ({ query }) =>
      runTool(deps, 'search', {}, async () => {
        requireOrganization(deps.context)
        const result = await searchClients(deps.db, { query, limit: 10 })
        return {
          payload: {
            results: result.clients.map((c) => ({
              id: c.id,
              title: c.name || 'Untitled account',
              url: 'https://scalyo.app/clients/' + c.id,
            })),
          },
          resultCount: result.count,
        }
      })
  )

  server.registerTool(
    'fetch',
    {
      description:
        'Retrieves one Scalyo customer account in full by the id returned from search. Read-only.',
      inputSchema: { id: uuidSchema },
    },
    async ({ id }) =>
      runTool(deps, 'fetch', {}, async () => {
        requireOrganization(deps.context)
        const client = await getClientOverview(deps.db, id)
        return {
          payload: {
            id: client.id,
            title: client.name || 'Untitled account',
            text: JSON.stringify(client, null, 2),
            url: 'https://scalyo.app/clients/' + client.id,
            metadata: { effectiveStatus: client.effectiveStatus, riskReasons: client.riskReasons },
          },
          resultCount: 1,
        }
      })
  )
}

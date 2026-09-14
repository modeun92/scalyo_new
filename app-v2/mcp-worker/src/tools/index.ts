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
//   - declares title + readOnly/destructive/openWorld annotations, so a host does not
//     have to infer from the name whether calling it is safe (MCP-TOOL-ANNOTATIONS);
//   - declares an outputSchema and returns structuredContent alongside a compact text
//     fallback, so the model parses fields instead of re-reading prettified JSON;
//   - returns machine values, never a sentence: the model formats the prose and we never
//     ship a string we would have to translate (rule 4 — no hard-coded translation here);
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
  structuredContent?: Record<string, unknown>
  isError?: boolean
}

/**
 * MCP-STRUCTURED-RESULT (14/09/2026): every successful tool returns BOTH
 * `structuredContent` (validated against the tool's outputSchema by the SDK) and a
 * compact text rendering. Not one or the other:
 *   - structuredContent is what a host parses, and what makes the outputSchema mean
 *     anything — the SDK validates it and a drift between schema and payload becomes a
 *     loud protocol error here rather than a model quietly misreading a field;
 *   - the text block is the fallback for a client that ignores structured results, and
 *     it is compact rather than 2-space indented because the pretty-printing was pure
 *     token cost in a context window.
 */
function json(value: Record<string, unknown>): ToolResult {
  return { structuredContent: value, content: [{ type: 'text', text: JSON.stringify(value) }] }
}

/**
 * An error result carries NO structuredContent: the SDK exempts `isError` from
 * outputSchema validation, and an error shaped like a successful payload is exactly how
 * a model ends up reporting "0 clients" for a failed read (R21 / D-14).
 */
function errorResult(payload: Record<string, unknown>): ToolResult {
  return { content: [{ type: 'text', text: JSON.stringify(payload) }], isError: true }
}

/**
 * Shared annotations. Every v1 tool is a read: stating it explicitly rather than relying
 * on a host's default is what lets ChatGPT and Claude skip a write confirmation prompt,
 * and what makes the day a write tool is added a visible, reviewable diff.
 */
const READ_ONLY = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  // Scalyo's own database only — no web access, no third-party call, no open world.
  openWorldHint: false,
} as const

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
  work: () => Promise<{ payload: Record<string, unknown>; resultCount?: number }>
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
    return errorResult(toSafePayload(error, requestId))
  }
}

// ---------------------------------------------------------------------------- output
//
// MCP-OUTPUT-SCHEMA (14/09/2026): these describe what the tools actually return, and the
// SDK validates every structuredContent against them. They are therefore a contract test
// that runs in production: change a service payload without changing the schema and the
// tool fails loudly here, instead of the model silently reading `undefined` and reporting
// a confident wrong number to a customer.
//
// Nullable, never optional, on every data field — a null is Scalyo saying "not recorded"
// (R21), and a field that may simply vanish teaches a model to treat absence as zero.

const effectiveStatusSchema = z.enum(['critical', 'watch', 'healthy'])

const clientSummarySchema = z.object({
  id: z.string(),
  name: z.string().nullable(),
  /** Score on the /10 scale, or null. Never a substituted 0. */
  health: z.number().nullable(),
  healthScale: z.string(),
  effectiveStatus: effectiveStatusSchema,
  arr: z.number().nullable(),
  renewalDate: z.string().nullable(),
  daysToRenewal: z.number().nullable(),
  renewalOverdue: z.boolean(),
  lifecycle: z.string().nullable(),
  churnRisk: z.number().nullable(),
  riskReasons: z.array(z.string()),
})

const clientListOutput = z.object({
  count: z.number(),
  truncated: z.boolean(),
  clients: z.array(clientSummarySchema),
})

const serverStatusOutput = z.object({
  server: z.string(),
  version: z.string(),
  environment: z.string(),
  connected: z.boolean(),
  readOnly: z.boolean(),
  account: z.string().nullable(),
  role: z.string().nullable(),
  organizationConnected: z.boolean(),
})

const portfolioSummaryOutput = z.object({
  healthScale: z.object({
    max: z.number(),
    critical: z.string(),
    watch: z.string(),
    healthy: z.string(),
    note: z.string(),
  }),
  clientCount: z.number(),
  prospectsExcluded: z.number(),
  totalArr: z.number(),
  clientsWithoutArr: z.number(),
  arrAtRisk: z.number(),
  averageHealth: z.number().nullable(),
  healthDistribution: z.object({ critical: z.number(), watch: z.number(), healthy: z.number() }),
  renewalsNext30Days: z.number(),
  renewalsOverdue: z.number(),
  overdueTasks: z.number(),
  partial: z.boolean(),
  partialNote: z.string().nullable(),
  currencyNote: z.string(),
})

const atRiskOutput = clientListOutput.extend({ scannedClients: z.number() })

const upcomingRenewalsOutput = clientListOutput.extend({ windowDays: z.number() })

const clientOverviewOutput = clientSummarySchema.extend({
  industry: z.string().nullable(),
  csm: z.string().nullable(),
  nps: z.number().nullable(),
  pipelineStage: z.string().nullable(),
  createdAt: z.string().nullable(),
  updatedAt: z.string().nullable(),
  omittedFields: z.object({ note: z.string(), fields: z.array(z.string()) }),
})

const myTasksOutput = z.object({
  count: z.number(),
  truncated: z.boolean(),
  tasks: z.array(
    z.object({
      id: z.string(),
      title: z.string().nullable(),
      status: z.string().nullable(),
      priority: z.string().nullable(),
      clientId: z.string().nullable(),
      dueDate: z.string().nullable(),
      daysUntilDue: z.number().nullable(),
      overdue: z.boolean(),
    })
  ),
})

const connectorSearchOutput = z.object({
  results: z.array(z.object({ id: z.string(), title: z.string(), url: z.string() })),
})

const connectorFetchOutput = z.object({
  id: z.string(),
  title: z.string(),
  text: z.string(),
  url: z.string(),
  metadata: z.object({ effectiveStatus: effectiveStatusSchema, riskReasons: z.array(z.string()) }),
})

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
      title: 'Check the Scalyo connection',
      description:
        'Confirms the Scalyo MCP connection works and reports which Scalyo account the other tools will read from, ' +
        'as the signed-in email address and that account\'s role. Use it to diagnose a connection, not to obtain identifiers. Read-only.',
      inputSchema: {},
      outputSchema: serverStatusOutput,
      annotations: { ...READ_ONLY, title: 'Check the Scalyo connection' },
    },
    async () =>
      runTool(deps, 'get_server_status', {}, async () => ({
        // MCP-STATUS-MINIMAL (14/09/2026): no userId, no organizationId, no requestId.
        // A status tool is the one an assistant calls first and quotes back verbatim, so
        // every internal identifier in it ends up pasted into a chat transcript that
        // leaves the EU. They stay in the audit log, where an incident can still use
        // them. The email is what a human needs to recognise their own account.
        payload: {
          server: 'scalyo-mcp',
          version: '1.0.0',
          environment: deps.environment,
          connected: true,
          readOnly: true,
          account: deps.context.email,
          role: deps.context.role,
          organizationConnected: deps.context.organizationId !== null,
        },
      }))
  )

  // ---------------------------------------------------------------- portfolio

  server.registerTool(
    'get_portfolio_summary',
    {
      title: 'Portfolio summary',
      description:
        'Returns the high-level state of the Customer Success portfolio visible to the authenticated Scalyo user: ' +
        'number of active accounts, total ARR, ARR at risk, average health score out of 10, the critical/watch/healthy ' +
        'distribution, renewals due in the next 30 days, overdue renewals, and the user\'s overdue tasks. ' +
        'Prospects are excluded from all figures. Read-only.',
      inputSchema: {},
      outputSchema: portfolioSummaryOutput,
      annotations: { ...READ_ONLY, title: 'Portfolio summary' },
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
      title: 'Accounts needing attention',
      description:
        'Returns the customer accounts visible to the authenticated Scalyo user that currently require attention, ' +
        'ranked by severity then ARR. An account is at risk when its effective health status is critical or watch, ' +
        'its renewal is overdue or near, or its churn risk is high. Each account carries machine-readable riskReasons. ' +
        'Prospects are excluded. Read-only.',
      inputSchema: { limit: limitSchema },
      outputSchema: atRiskOutput,
      annotations: { ...READ_ONLY, title: 'Accounts needing attention' },
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
      title: 'Upcoming renewals',
      description:
        'Returns customer accounts whose contract renewal falls within the next N days, earliest first. ' +
        'Strictly future-dated: renewals already past are NOT included here — those are reported by get_at_risk_clients ' +
        'with the renewal_overdue reason. Prospects are excluded. Read-only.',
      inputSchema: {
        withinDays: z.number().int().min(1).max(365).default(30),
        limit: limitSchema,
      },
      outputSchema: upcomingRenewalsOutput,
      annotations: { ...READ_ONLY, title: 'Upcoming renewals' },
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
      title: 'Search customer accounts',
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
      outputSchema: clientListOutput,
      annotations: { ...READ_ONLY, title: 'Search customer accounts' },
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
      title: 'Customer account overview',
      description:
        'Returns a detailed summary of one customer account by its Scalyo id: name, industry, lifecycle, ARR and MRR, ' +
        'health score out of 10, effective status, churn risk, NPS, renewal date and assigned CSM. ' +
        'Contacts and free-form notes are never returned. Read-only.',
      inputSchema: { clientId: uuidSchema.describe('The Scalyo client id, as returned by search_clients.') },
      outputSchema: clientOverviewOutput,
      annotations: { ...READ_ONLY, title: 'Customer account overview' },
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
      title: 'My Scalyo tasks',
      description:
        'Returns the Customer Success tasks assigned to the authenticated Scalyo user, earliest due date first, ' +
        'each flagged as overdue or not. Only the signed-in user\'s own tasks are returned, never a teammate\'s. Read-only.',
      inputSchema: {
        overdueOnly: z.boolean().default(false),
        includeDone: z.boolean().default(false),
        limit: limitSchema,
      },
      outputSchema: myTasksOutput,
      annotations: { ...READ_ONLY, title: 'My Scalyo tasks' },
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
      title: 'Search Scalyo (connector)',
      description:
        'Searches Scalyo customer accounts visible to the authenticated user and returns matching records as ' +
        'id/title/url results. Generic entry point for connector clients; prefer search_clients or ' +
        'get_at_risk_clients when available, as they return richer Customer Success fields. Read-only.',
      inputSchema: { query: querySchema },
      outputSchema: connectorSearchOutput,
      annotations: { ...READ_ONLY, title: 'Search Scalyo (connector)' },
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
      title: 'Fetch a Scalyo record (connector)',
      description:
        'Retrieves one Scalyo customer account in full by the id returned from search. Read-only.',
      inputSchema: { id: uuidSchema },
      outputSchema: connectorFetchOutput,
      annotations: { ...READ_ONLY, title: 'Fetch a Scalyo record (connector)' },
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

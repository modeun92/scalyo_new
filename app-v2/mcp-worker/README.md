# scalyo-mcp-worker

The customer-facing Scalyo MCP server. A separate Cloudflare Worker that lets a Scalyo user
connect their account to Claude, ChatGPT or any MCP client and ask about their own
portfolio. **Read-only**, RLS-preserving, deployed independently of the website.

**Full documentation — architecture, security model, setup, release checklist, incident
runbook — lives in [`docs/MCP_SERVER.md`](../../docs/MCP_SERVER.md).** This file is the
short version for someone already in this directory.

```sh
npm install
npm run typecheck     # both tsconfigs: Worker code and tests
npm test              # unit + contract; the live isolation suite skips without credentials
npm run dev           # needs .dev.vars with SUPABASE_URL and SUPABASE_ANON_KEY
npm run deploy:preprod
```

## Layout

```
src/
  index.ts                  routing, auth gate, rate limits, createMcpHandler
  env.ts                    typed env, fail-loud config
  errors.ts                 safe error categories (no stacks, no PostgREST bodies)
  auth/
    verify-token.ts         bearer extraction + Supabase /auth/v1/user validation
    user-context.ts         server-derived userId / organizationId / role, fails closed
    protected-resource.ts   RFC 9728 discovery + the 401 that starts the OAuth flow
  supabase/user-client.ts   anon key + USER token. The ONLY database path.
  domain/health.ts          third mirror of the /10 health scale — parity is enforced by test
  services/                 portfolio, clients, tasks business logic
  tools/index.ts            the nine v1 tools
  audit/mcp-audit.ts        structured audit events
test/
  health-parity.test.ts     fails if the health scale drifts from the other two copies
  input-safety.test.ts      filter-injection, allowlists, output minimization, bounds
  auth-and-logic.test.ts    token handling, fail-closed tenancy, safe errors, R21 nulls
  tool-contract.test.ts     tool set, schemas, and behaviour against the real SDK
  tenant-isolation.test.ts  LIVE org A / org B isolation. No mocks. Skips without credentials.
```

## Three rules that are load-bearing

1. **Never bind `SUPABASE_SERVICE_ROLE_KEY` to this Worker.** Its absence is what stops a
   future contributor reaching for an RLS-bypassing client. One forgotten organization
   filter would otherwise become a cross-tenant leak to an external AI client.
2. **No tool may accept `user_id`, `organization_id` or `role`.** An AI client will pass
   whatever a prompt tells it to. Tenant context comes from `auth/user-context.ts` only.
   `test/tool-contract.test.ts` enforces this.
3. **A skipped tenant-isolation run is not a pass.** Run it against pre-production before
   every production deploy.

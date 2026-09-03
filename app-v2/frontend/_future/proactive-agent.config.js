// ═══════════════════════════════════════════════════════════════════════════
// SCALYO — Proactive AI Agent (Niveau 4)
// ═══════════════════════════════════════════════════════════════════════════
// This file is NOT wired into the app. It is ready to plug in when needed.
// To activate: import into a Cloudflare Worker cron trigger.
//
// Architecture:
//   Cron (daily) → read user data from Supabase → run rules → generate alerts
//   Alerts stored in notifications table → shown via notification store
//
// Zero hardcode: all rules are declarative objects. Add a rule = add an object.
// ═══════════════════════════════════════════════════════════════════════════

// ─── Rule engine: each rule is a function that receives context and returns alerts ───

export const PROACTIVE_RULES = [
  {
    id: 'renewal_approaching',
    priority: 'critical',
    category: 'retention',
    condition: (ctx) => {
      const soon = ctx.clients.filter(c => {
        if (!c.renewal_date) return false
        const days = Math.ceil((new Date(c.renewal_date) - new Date()) / 86400000)
        return days > 0 && days <= 30
      })
      return soon.length > 0 ? { clients: soon } : null
    },
    message: (ctx, data) => ({
      titleKey: 'proactive_renewal_title',
      bodyKey: 'proactive_renewal_body',
      bodyParams: { count: data.clients.length, names: data.clients.map(c => c.name).slice(0, 3).join(', ') },
      route: '/app/portfolio',
      icon: '⏰',
    }),
  },

  {
    id: 'health_score_drop',
    priority: 'high',
    category: 'risk',
    condition: (ctx) => {
      const atRisk = ctx.clients.filter(c => c.health_score !== null && c.health_score < 40)
      return atRisk.length > 0 ? { clients: atRisk } : null
    },
    message: (ctx, data) => ({
      titleKey: 'proactive_health_title',
      bodyKey: 'proactive_health_body',
      bodyParams: { count: data.clients.length },
      route: '/app/portfolio',
      icon: '⚠️',
    }),
  },

  {
    id: 'no_contact_45_days',
    priority: 'medium',
    category: 'engagement',
    condition: (ctx) => {
      const stale = ctx.clients.filter(c => {
        if (!c.last_contact_at) return true
        const days = Math.ceil((new Date() - new Date(c.last_contact_at)) / 86400000)
        return days >= 45
      })
      return stale.length > 0 ? { clients: stale } : null
    },
    message: (ctx, data) => ({
      titleKey: 'proactive_stale_title',
      bodyKey: 'proactive_stale_body',
      bodyParams: { count: data.clients.length },
      route: '/app/portfolio',
      icon: '📭',
    }),
  },

  {
    id: 'overdue_tasks',
    priority: 'high',
    category: 'productivity',
    condition: (ctx) => {
      const overdue = ctx.tasks.filter(t => t.due_date && new Date(t.due_date) < new Date() && t.status !== 'done')
      return overdue.length > 0 ? { tasks: overdue } : null
    },
    message: (ctx, data) => ({
      titleKey: 'proactive_overdue_title',
      bodyKey: 'proactive_overdue_body',
      bodyParams: { count: data.tasks.length },
      route: '/app/tasks/priorities',
      icon: '🚨',
    }),
  },

  {
    id: 'team_workload_imbalance',
    priority: 'medium',
    category: 'management',
    condition: (ctx) => {
      if (!ctx.team || ctx.team.length < 2) return null
      const loads = ctx.team.map(m => ({
        name: m.name,
        count: ctx.clients.filter(c => c.owner_id === m.id).length,
      }))
      const max = Math.max(...loads.map(l => l.count))
      const min = Math.min(...loads.map(l => l.count))
      return max > min * 2 ? { loads } : null
    },
    message: (ctx, data) => ({
      titleKey: 'proactive_workload_title',
      bodyKey: 'proactive_workload_body',
      bodyParams: {},
      route: '/app/workload',
      icon: '⚖️',
    }),
  },
]

// ─── Runner: execute all rules against user context ───

export async function runProactiveRules(supabase, userId, token) {
  // 1. Load context
  const headers = { apikey: supabase.anonKey, Authorization: 'Bearer ' + token }
  const [clientsRes, tasksRes, teamRes] = await Promise.all([
    fetch(supabase.url + '/rest/v1/clients?owner_id=eq.' + userId + '&select=*', { headers }),
    fetch(supabase.url + '/rest/v1/tasks?assignee_id=eq.' + userId + '&select=*', { headers }),
    fetch(supabase.url + '/rest/v1/team_members?select=*', { headers }),
  ])

  const ctx = {
    userId,
    clients: await clientsRes.json(),
    tasks: await tasksRes.json(),
    team: await teamRes.json(),
  }

  // 2. Evaluate rules
  const alerts = []
  for (const rule of PROACTIVE_RULES) {
    try {
      const match = rule.condition(ctx)
      if (match) {
        alerts.push({
          ruleId: rule.id,
          priority: rule.priority,
          category: rule.category,
          ...rule.message(ctx, match),
          timestamp: new Date().toISOString(),
        })
      }
    } catch (e) {
      console.error('Rule ' + rule.id + ' failed:', e)
    }
  }

  return alerts
}

// ─── Cron handler (Cloudflare Worker scheduled event) ───
// export default { async scheduled(event, env, ctx) { ... } }
// Wire this into wrangler.toml: [triggers] crons = ["0 7 * * *"]

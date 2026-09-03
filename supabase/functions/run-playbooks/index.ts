import { serve } from "https://deno.land/std@0.177.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders })

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    )

    // Get user from JWT
    const authHeader = req.headers.get("Authorization")
    if (!authHeader) return json({ error: "unauthorized" }, 401)
    const { data: { user }, error: authErr } = await supabase.auth.getUser(authHeader.replace("Bearer ", ""))
    if (authErr || !user) return json({ error: "unauthorized" }, 401)

    // 1. Get active rules for this user
    const { data: rules, error: rulesErr } = await supabase
      .from("playbook_rules")
      .select("*")
      .eq("user_id", user.id)
      .eq("is_active", true)
    if (rulesErr) throw rulesErr
    if (!rules || rules.length === 0) return json({ executions: [], message: "No active rules" })

    // 2. Get all clients for this user
    const { data: clients, error: clientsErr } = await supabase
      .from("clients")
      .select("*")
      .eq("user_id", user.id)
    if (clientsErr) throw clientsErr
    if (!clients || clients.length === 0) return json({ executions: [], message: "No clients" })

    // 3. Get recent executions for cooldown check
    const { data: recentExec } = await supabase
      .from("playbook_executions")
      .select("rule_id, client_id, executed_at")
      .eq("user_id", user.id)

    const executions = []

    for (const rule of rules) {
      for (const client of clients) {
        // Check if this rule was already triggered for this client within cooldown
        const cooldownMs = (rule.cooldown_days || 7) * 24 * 60 * 60 * 1000
        const alreadyTriggered = (recentExec || []).some(e =>
          e.rule_id === rule.id &&
          e.client_id === client.id &&
          (Date.now() - new Date(e.executed_at).getTime()) < cooldownMs
        )
        if (alreadyTriggered) continue

        // Evaluate trigger
        let triggered = false
        let triggerValue = null

        switch (rule.trigger_type) {
          case "health_below":
            triggerValue = client.health ?? 0
            triggered = triggerValue < rule.threshold
            break
          case "nps_below":
            triggerValue = client.nps ?? 0
            triggered = triggerValue < rule.threshold
            break
          case "churn_above":
            triggerValue = client.churn_risk ?? 0
            triggered = triggerValue > rule.threshold
            break
          case "renewal_in_days":
            if (client.renewal_date) {
              const daysUntil = Math.floor((new Date(client.renewal_date).getTime() - Date.now()) / (24*60*60*1000))
              triggerValue = daysUntil
              triggered = daysUntil >= 0 && daysUntil <= rule.threshold
            }
            break
        }

        if (!triggered) continue

        const actions = []

        // Create task if configured
        if (rule.action_create_task) {
          const dueDate = new Date()
          dueDate.setDate(dueDate.getDate() + (rule.task_due_days || 3))

          const { error: taskErr } = await supabase.from("tasks").insert({
            user_id: user.id,
            title: rule.task_title || `[Playbook] ${rule.name} - ${client.name}`,
            status: "todo",
            priority: rule.task_priority || "high",
            due_date: dueDate.toISOString().split("T")[0],
            client_id: client.id,
          })
          if (!taskErr) actions.push({ type: "task_created", title: rule.task_title })
        }

        // Log execution
        const { error: execErr } = await supabase.from("playbook_executions").insert({
          rule_id: rule.id,
          client_id: client.id,
          user_id: user.id,
          client_name: client.name,
          trigger_value: triggerValue,
          actions: actions,
        })

        if (!execErr) {
          executions.push({
            rule: rule.name,
            client: client.name,
            trigger_type: rule.trigger_type,
            trigger_value: triggerValue,
            actions,
          })
        }
      }
    }

    return json({ executions, count: executions.length })
  } catch (e) {
    console.error("[run-playbooks]", e)
    return json({ error: e.message }, 500)
  }
})

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  })
}
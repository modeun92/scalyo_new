// ═══════════════════════════════════════════════════════════════════════════
// SCALYO — Autonomous AI Actions (Niveau 5)
// ═══════════════════════════════════════════════════════════════════════════
// This file is NOT wired into the app. Ready to plug in for a future version.
//
// Architecture:
//   User approves an action suggestion from the AI agent →
//   Action executor reads the config → performs the Supabase mutation →
//   Logs the action in ai_actions table for audit
//
// Each action is declarative: what it does, what it needs, how to undo.
// Zero hardcode. Add an action = add an object.
// ═══════════════════════════════════════════════════════════════════════════

export const AUTONOMOUS_ACTIONS = {
  create_task: {
    id: 'create_task',
    labelKey: 'action_create_task',
    descKey: 'action_create_task_desc',
    category: 'productivity',
    requiresApproval: true,
    params: ['title', 'description', 'assignee_id', 'due_date', 'priority', 'client_id'],
    validate: (params) => {
      if (!params.title?.trim()) return { valid: false, reason: 'Title required' }
      return { valid: true }
    },
    execute: async (supabase, userId, params) => {
      const { data, error } = await supabase
        .from('tasks')
        .insert({
          title: params.title,
          description: params.description || '',
          assignee_id: params.assignee_id || userId,
          due_date: params.due_date || null,
          priority: params.priority || 'medium',
          client_id: params.client_id || null,
          status: 'todo',
          created_by: userId,
          created_by_ai: true,
        })
        .select()
        .single()
      return { success: !error, data, error }
    },
    undo: async (supabase, actionLog) => {
      return supabase.from('tasks').delete().eq('id', actionLog.result_id)
    },
  },

  trigger_playbook: {
    id: 'trigger_playbook',
    labelKey: 'action_trigger_playbook',
    descKey: 'action_trigger_playbook_desc',
    category: 'retention',
    requiresApproval: true,
    params: ['playbook_id', 'client_id'],
    validate: (params) => {
      if (!params.playbook_id || !params.client_id) return { valid: false, reason: 'Playbook and client required' }
      return { valid: true }
    },
    execute: async (supabase, userId, params) => {
      const { data, error } = await supabase
        .from('playbook_instances')
        .insert({
          playbook_id: params.playbook_id,
          client_id: params.client_id,
          status: 'active',
          started_by: userId,
          started_by_ai: true,
        })
        .select()
        .single()
      return { success: !error, data, error }
    },
    undo: async (supabase, actionLog) => {
      return supabase.from('playbook_instances').update({ status: 'cancelled' }).eq('id', actionLog.result_id)
    },
  },

  draft_email: {
    id: 'draft_email',
    labelKey: 'action_draft_email',
    descKey: 'action_draft_email_desc',
    category: 'communication',
    requiresApproval: true,
    params: ['to', 'subject', 'html', 'client_id'],
    validate: (params) => {
      if (!params.to || !params.subject) return { valid: false, reason: 'Recipient and subject required' }
      return { valid: true }
    },
    execute: async (supabase, userId, params) => {
      const { data, error } = await supabase
        .from('email_drafts')
        .insert({
          to: params.to,
          subject: params.subject,
          html: params.html || '',
          client_id: params.client_id || null,
          created_by: userId,
          created_by_ai: true,
          status: 'draft',
        })
        .select()
        .single()
      return { success: !error, data, error }
    },
    undo: async (supabase, actionLog) => {
      return supabase.from('email_drafts').delete().eq('id', actionLog.result_id)
    },
  },

  update_health_score: {
    id: 'update_health_score',
    labelKey: 'action_update_health',
    descKey: 'action_update_health_desc',
    category: 'risk',
    requiresApproval: true,
    params: ['client_id', 'new_score', 'reason'],
    validate: (params) => {
      if (!params.client_id) return { valid: false, reason: 'Client required' }
      if (params.new_score < 0 || params.new_score > 100) return { valid: false, reason: 'Score must be 0-100' }
      return { valid: true }
    },
    execute: async (supabase, userId, params) => {
      const { data, error } = await supabase
        .from('clients')
        .update({ health_score: params.new_score, health_reason: params.reason })
        .eq('id', params.client_id)
        .select()
        .single()
      return { success: !error, data, error }
    },
    undo: async (supabase, actionLog) => {
      return supabase.from('clients').update({ health_score: actionLog.previous_value }).eq('id', actionLog.result_id)
    },
  },
}

// ─── Action executor (called by AI agent when user approves) ───

export async function executeAction(supabase, userId, actionId, params) {
  const action = AUTONOMOUS_ACTIONS[actionId]
  if (!action) return { success: false, error: 'Unknown action: ' + actionId }

  const validation = action.validate(params)
  if (!validation.valid) return { success: false, error: validation.reason }

  // Log the attempt
  const logEntry = {
    user_id: userId,
    action_id: actionId,
    params: JSON.stringify(params),
    status: 'pending',
    created_at: new Date().toISOString(),
  }

  try {
    const result = await action.execute(supabase, userId, params)

    logEntry.status = result.success ? 'completed' : 'failed'
    logEntry.result_id = result.data?.id || null
    logEntry.error = result.error ? JSON.stringify(result.error) : null

    // Store log (fire and forget)
    supabase.from('ai_actions_log').insert(logEntry)

    return result
  } catch (e) {
    logEntry.status = 'error'
    logEntry.error = e.message
    supabase.from('ai_actions_log').insert(logEntry)
    return { success: false, error: e.message }
  }
}

// ─── SQL for ai_actions_log table (run when activating Level 5) ───
// CREATE TABLE ai_actions_log (
//   id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
//   user_id UUID REFERENCES auth.users(id),
//   action_id TEXT NOT NULL,
//   params JSONB,
//   status TEXT DEFAULT 'pending',
//   result_id UUID,
//   previous_value JSONB,
//   error TEXT,
//   created_at TIMESTAMPTZ DEFAULT now()
// );
// ALTER TABLE ai_actions_log ENABLE ROW LEVEL SECURITY;
// CREATE POLICY "Users read own actions" ON ai_actions_log FOR SELECT USING (auth.uid() = user_id);

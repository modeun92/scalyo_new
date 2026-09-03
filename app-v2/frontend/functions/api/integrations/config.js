// === SCALYO — Manual integration connect/update — server-side custody (CR-8: E-09) ===
// POST /api/integrations/config → { provider, fields: { ... } }
// The secret fields (api_key, webhook_url) are encrypted with AES-256-GCM before storage.
// The client can no longer write org_integrations.config (column REVOKE, migration CR-8).

import { extractLang, extractAuth, verifyJwt } from '../_services/auth.service.js'
import { getConfig } from '../_config/index.js'
import { createSupabaseClient } from '../_utils/supabase.js'
import { MANUAL_FIELDS, SECRET_FIELD_KEYS } from '../_config/integrations-server.js'
import { encryptToken } from '../_config/crypto.js'
import { jsonOk, jsonError } from '../_utils/response.js'

export async function onRequestPost(context) {
  const lang = extractLang(context.request)
  try {
    const config = getConfig(context.env)
    const { token } = extractAuth(context.request)
    const jwt = await verifyJwt(token, config)
    if (!jwt.valid) return jsonError('unauthorized', 401, lang)

    if (!context.env.ENCRYPTION_KEY) {
      console.error('integrations/config: encryption_key_missing')
      return jsonError('server_error', 500, lang)
    }

    let body
    try { body = await context.request.json() } catch { return jsonError('invalid_request', 400, lang) }
    const provider = body.provider
    const fields = body.fields
    const allowedKeys = MANUAL_FIELDS[provider]
    if (!allowedKeys || !fields || typeof fields !== 'object') {
      return jsonError('invalid_request', 400, lang)
    }

    // Keep only the catalog's fields, encrypt the secrets
    const cfg = {}
    for (const key of allowedKeys) {
      const value = (fields[key] || '').toString().trim()
      if (!value) return jsonError('invalid_request', 400, lang)
      if (value.length > 2048) return jsonError('invalid_request', 400, lang)
      if (SECRET_FIELD_KEYS.includes(key)) {
        const encrypted = await encryptToken(value, context.env.ENCRYPTION_KEY)
        if (!encrypted) {
          console.error('integrations/config: encryption failed')
          return jsonError('server_error', 500, lang)
        }
        cfg[key] = encrypted
      } else {
        cfg[key] = value
      }
    }

    const db = createSupabaseClient(context.env)
    const existing = await db.selectOne(
      'org_integrations',
      'user_id=eq.' + jwt.userId + '&integration_id=eq.' + encodeURIComponent(provider) + '&select=id'
    )

    let row
    if (existing) {
      const rows = await db.update('org_integrations', 'id=eq.' + existing.id, {
        config: cfg,
        status: 'active',
        updated_at: new Date().toISOString(),
      })
      row = rows[0]
    } else {
      const rows = await db.insert('org_integrations', {
        user_id: jwt.userId,
        integration_id: provider,
        status: 'active',
        config: cfg,
        connected_at: new Date().toISOString(),
      })
      row = rows[0]
    }

    // Response: safe columns only — never config/tokens
    return jsonOk({
      id: row.id,
      integration_id: row.integration_id,
      status: row.status,
      connected_at: row.connected_at,
      updated_at: row.updated_at || null,
    })
  } catch (err) {
    console.error('integrations/config crash:', err?.message || err)
    return jsonError('server_error', 500, lang)
  }
}

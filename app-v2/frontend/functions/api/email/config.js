// === SCALYO — Org email config (Resend) — server-side custody (CR-8: C-04/E-08) ===
// GET    /api/email/config  → { configured, sender_domain, sender_name } (owner)
// POST   /api/email/config  → { api_key?, sender_domain?, sender_name? } — key encrypted with AES-256-GCM
// DELETE /api/email/config  → disconnection (row deleted)
// The Resend key is NEVER returned to the client, in any form.

import { extractLang, extractAuth, verifyJwt } from '../_services/auth.service.js'
import { getConfig } from '../_config/index.js'
import { createSupabaseClient } from '../_utils/supabase.js'
import { encryptToken } from '../_config/crypto.js'
import { jsonOk, jsonError } from '../_utils/response.js'

const KEY_FORMAT = /^re_[A-Za-z0-9_-]{10,}$/

// D2 (approved contract): a member of an organization does not configure the key —
// only the org owner (or a user without an org, for themselves) can.
async function assertCanManage(db, userId) {
  const profile = await db.selectOne('profiles', 'id=eq.' + userId + '&select=organization_id')
  if (!profile?.organization_id) return true // solo: manages their own config
  const org = await db.selectOne('organizations', 'id=eq.' + profile.organization_id + '&select=owner_id')
  return org?.owner_id === userId
}

async function authAndDb(context, lang) {
  const config = getConfig(context.env)
  const { token } = extractAuth(context.request)
  const jwt = await verifyJwt(token, config)
  if (!jwt.valid) return { error: jsonError('unauthorized', 401, lang) }
  const db = createSupabaseClient(context.env)
  if (!(await assertCanManage(db, jwt.userId))) {
    return { error: jsonError('not_org_owner', 403, lang) }
  }
  return { db, userId: jwt.userId }
}

export async function onRequestGet(context) {
  const lang = extractLang(context.request)
  try {
    const { error, db, userId } = await authAndDb(context, lang)
    if (error) return error
    const row = await db.selectOne('org_email_config', 'owner_id=eq.' + userId + '&select=sender_domain,sender_name')
    return jsonOk({
      configured: !!row,
      sender_domain: row?.sender_domain || '',
      sender_name: row?.sender_name || '',
    })
  } catch (err) {
    console.error('email/config GET crash:', err?.message || err)
    return jsonError('server_error', 500, lang)
  }
}

export async function onRequestPost(context) {
  const lang = extractLang(context.request)
  try {
    const { error, db, userId } = await authAndDb(context, lang)
    if (error) return error

    if (!context.env.ENCRYPTION_KEY) {
      console.error('email/config: encryption_key_missing')
      return jsonError('server_error', 500, lang)
    }

    let body
    try { body = await context.request.json() } catch { return jsonError('invalid_request', 400, lang) }
    const apiKey = (body.api_key || '').trim()

    // Sender fields absent from the body must not overwrite the existing ones
    // (the wizard only sends the key)
    const senderFields = {}
    if ('sender_domain' in body) senderFields.sender_domain = (body.sender_domain || '').toString().trim()
    if ('sender_name' in body) senderFields.sender_name = (body.sender_name || '').toString().trim()

    const existing = await db.selectOne('org_email_config', 'owner_id=eq.' + userId + '&select=id')

    if (apiKey) {
      if (!KEY_FORMAT.test(apiKey)) return jsonError('invalid_key_format', 400, lang)
      const encrypted = await encryptToken(apiKey, context.env.ENCRYPTION_KEY)
      if (!encrypted) {
        console.error('email/config: encryption failed')
        return jsonError('server_error', 500, lang)
      }
      const payload = {
        resend_api_key: encrypted,
        ...senderFields,
        updated_at: new Date().toISOString(),
      }
      if (existing) await db.update('org_email_config', 'owner_id=eq.' + userId, payload)
      else await db.insert('org_email_config', { owner_id: userId, sender_domain: '', sender_name: '', ...payload })
    } else {
      // No key supplied: update the sender fields only, an existing config is required
      if (!existing) return jsonError('invalid_request', 400, lang)
      await db.update('org_email_config', 'owner_id=eq.' + userId, {
        ...senderFields,
        updated_at: new Date().toISOString(),
      })
    }
    return jsonOk({ configured: true })
  } catch (err) {
    console.error('email/config POST crash:', err?.message || err)
    return jsonError('server_error', 500, lang)
  }
}

export async function onRequestDelete(context) {
  const lang = extractLang(context.request)
  try {
    const { error, db, userId } = await authAndDb(context, lang)
    if (error) return error
    await db.remove('org_email_config', 'owner_id=eq.' + userId)
    return jsonOk({ configured: false })
  } catch (err) {
    console.error('email/config DELETE crash:', err?.message || err)
    return jsonError('server_error', 500, lang)
  }
}

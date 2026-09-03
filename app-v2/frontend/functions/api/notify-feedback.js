// === SCALYO — Alpha Feedback Notification ===
// POST /api/notify-feedback
// Called by Supabase Database Webhook on INSERT into alpha_feedback
// Sends email notification to contact@scalyo.app via Resend

import { jsonResponse, errorResponse } from './_utils/response.js'

function escapeHtml(str) {
  if (!str) return ''
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export async function onRequestPost(context) {
  const { env, request } = context

  try {
    // Verify webhook secret
    const secret = request.headers.get('x-webhook-secret')
    if (!secret || secret !== env.SUPABASE_WEBHOOK_SECRET) {
      return errorResponse(401, 'Unauthorized')
    }

    // Parse Supabase webhook payload
    let payload
    try {
      payload = await request.json()
    } catch {
      return errorResponse(400, 'Invalid payload')
    }

    const record = payload.record
    if (!record || payload.type !== 'INSERT') {
      return errorResponse(400, 'Invalid webhook event')
    }

    // Format date (ISO safe for Workers)
    const date = record.created_at
      ? new Date(record.created_at).toISOString().replace('T', ' ').slice(0, 19) + ' UTC'
      : 'N/A'

    // Send email via Resend
    const resendResp = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + env.RESEND_API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'Scalyo Alerts <contact@scalyo.app>',
        to: ['contact@scalyo.app'],
        subject: '[Alpha] ' + escapeHtml(record.category) + ' \u2014 ' + escapeHtml(record.page_route),
        html: [
          '<div style="font-family:-apple-system,BlinkMacSystemFont,sans-serif;max-width:600px;margin:0 auto;">',
          '<h2 style="color:#1a1a1a;margin-bottom:24px;">Nouveau feedback alpha</h2>',
          '<table style="width:100%;border-collapse:collapse;margin-bottom:24px;">',
          '<tr><td style="padding:8px 12px;font-weight:600;color:#666;width:120px;">Page</td>',
          '<td style="padding:8px 12px;color:#1a1a1a;">' + escapeHtml(record.page_route) + '</td></tr>',
          '<tr style="background:#f9f9f9;"><td style="padding:8px 12px;font-weight:600;color:#666;">Cat\u00e9gorie</td>',
          '<td style="padding:8px 12px;color:#1a1a1a;">' + escapeHtml(record.category) + '</td></tr>',
          '<tr><td style="padding:8px 12px;font-weight:600;color:#666;">Priorit\u00e9</td>',
          '<td style="padding:8px 12px;color:#1a1a1a;">' + escapeHtml(record.priority || 'medium') + '</td></tr>',
          '<tr style="background:#f9f9f9;"><td style="padding:8px 12px;font-weight:600;color:#666;">Date</td>',
          '<td style="padding:8px 12px;color:#1a1a1a;">' + escapeHtml(date) + '</td></tr>',
          '</table>',
          '<div style="padding:16px;background:#f5f5f5;border-radius:8px;color:#1a1a1a;line-height:1.6;">',
          escapeHtml(record.message),
          '</div></div>',
        ].join(''),
      }),
    })

    if (!resendResp.ok) {
      const err = await resendResp.text()
      console.error('Resend error:', resendResp.status, err)
      return errorResponse(502, 'Email send failed')
    }

    return jsonResponse({ sent: true })
  } catch (err) {
    console.error('notify-feedback crash:', err?.message || err)
    return errorResponse(500, 'Internal server error')
  }
}

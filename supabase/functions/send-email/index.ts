import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 })

  try {
    const authHeader = req.headers.get('authorization') || ''
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { authorization: authHeader } } }
    )

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const body = await req.json()
    const { to, subject, html, from_name, reply_to, template_id, resend_api_key } = body

    if (!to || !subject || !html) {
      return new Response(JSON.stringify({ error: 'Missing required fields: to, subject, html' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(to)) {
      return new Response(JSON.stringify({ error: 'Invalid email address' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Use customer's own Resend key if provided, otherwise use Scalyo's key
    const RESEND_API_KEY = resend_api_key || Deno.env.get('RESEND_API_KEY')
    if (!RESEND_API_KEY) {
      return new Response(JSON.stringify({ error: 'No Resend API key configured. Please add your Resend API key in Settings → Integrations.' }), {
        status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Generate unique tracking ID
    const trackingId = crypto.randomUUID()
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const trackingPixel = `<img src="${supabaseUrl}/functions/v1/track-open?id=${trackingId}" width="1" height="1" style="display:none" alt="" />`

    // Inject tracking pixel at end of HTML
    const htmlWithTracking = html + trackingPixel

    const resendResp = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: from_name ? `${from_name} via Scalyo <noreply@scalyo.app>` : 'Scalyo <noreply@scalyo.app>',
        to: [to],
        reply_to: reply_to || user.email,
        subject,
        html: htmlWithTracking,
      })
    })

    const resendData = await resendResp.json()

    if (!resendResp.ok) {
      return new Response(JSON.stringify({ error: 'Failed to send email', details: resendData }), {
        status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Save to sent_emails table using service role
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )
    await supabaseAdmin.from('sent_emails').insert({
      user_id: user.id,
      to_email: to,
      subject,
      template_id: template_id || null,
      from_name: from_name || null,
      resend_id: resendData.id,
      tracking_id: trackingId,
      sent_at: new Date().toISOString(),
      open_count: 0,
    })

    return new Response(JSON.stringify({
      success: true,
      id: resendData.id,
      tracking_id: trackingId,
      message: 'Email sent successfully'
    }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

  } catch (err) {
    console.error('send-email error:', err)
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})

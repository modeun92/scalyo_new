import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// 1x1 transparent GIF
const PIXEL = new Uint8Array([
  0x47,0x49,0x46,0x38,0x39,0x61,0x01,0x00,0x01,0x00,
  0x80,0x00,0x00,0xff,0xff,0xff,0x00,0x00,0x00,0x21,
  0xf9,0x04,0x00,0x00,0x00,0x00,0x00,0x2c,0x00,0x00,
  0x00,0x00,0x01,0x00,0x01,0x00,0x00,0x02,0x02,0x44,
  0x01,0x00,0x3b
])

serve(async (req) => {
  // Always return pixel regardless of errors
  const pixelResponse = new Response(PIXEL, {
    headers: {
      'Content-Type': 'image/gif',
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0',
    }
  })

  try {
    const url = new URL(req.url)
    const trackingId = url.searchParams.get('id')
    if (!trackingId) return pixelResponse

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    // Get current record
    const { data } = await supabase
      .from('sent_emails')
      .select('open_count, opened_at')
      .eq('tracking_id', trackingId)
      .single()

    if (data) {
      await supabase
        .from('sent_emails')
        .update({
          opened_at: data.opened_at || new Date().toISOString(),
          open_count: (data.open_count || 0) + 1,
          last_opened_at: new Date().toISOString(),
        })
        .eq('tracking_id', trackingId)
    }
  } catch (e) {
    console.error('track-open error:', e)
  }

  return pixelResponse
})

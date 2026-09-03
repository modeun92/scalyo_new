import { serve } from "https://deno.land/std@0.177.0/http/server.ts"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders })
  }
  try {
    const { api_key } = await req.json()
    if (!api_key || typeof api_key !== "string") {
      return json({ valid: false, error: "missing_api_key" }, 400)
    }
    if (!/^re_[A-Za-z0-9_-]{10,}$/.test(api_key)) {
      return json({ valid: false, error: "invalid_format" }, 400)
    }
    const resp = await fetch("https://api.resend.com/domains", {
      method: "GET",
      headers: { "Authorization": `Bearer ${api_key}`, "Content-Type": "application/json" },
    })
    if (resp.ok) return json({ valid: true })
    if (resp.status === 401) return json({ valid: false, error: "unauthorized" })
    if (resp.status === 403) return json({ valid: false, error: "forbidden" })
    return json({ valid: false, error: `resend_error_${resp.status}` })
  } catch (e) {
    console.error("[test-resend-key] error", e)
    return json({ valid: false, error: "server_error" }, 500)
  }
})

function json(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  })
}
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import Stripe from 'https://esm.sh/stripe@12.18.0?target=deno'

serve(async (req) => {
  const signature = req.headers.get('stripe-signature')
  const body = await req.text()
  const stripeSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET') || ''
  const stripeKey = Deno.env.get('STRIPE_SECRET_KEY') || ''

  let event
  try {
    const stripe = new Stripe(stripeKey, { apiVersion: '2023-10-16', httpClient: Stripe.createFetchHttpClient() })
    event = await stripe.webhooks.constructEventAsync(body, signature || '', stripeSecret)
  } catch (err) {
    return new Response('Webhook error: ' + err.message, { status: 400 })
  }

  const supabase = createClient(Deno.env.get('SUPABASE_URL'), Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'))

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object
    const customerId = session.customer
    const subscriptionId = session.subscription
    const customerEmail = session.customer_email || session.customer_details?.email
    if (customerEmail && subscriptionId) {
      const { data: users } = await supabase.auth.admin.listUsers()
      const user = users?.users?.find(u => u.email === customerEmail)
      if (user) {
        await supabase.from('profiles').update({
          stripe_subscription_id: subscriptionId,
          stripe_customer_id: customerId,
          trial_used: true,
        }).eq('id', user.id)
      }
    }
  }

  if (event.type === 'customer.subscription.deleted') {
    const sub = event.data.object
    await supabase.from('profiles').update({ stripe_subscription_id: null }).eq('stripe_subscription_id', sub.id)
  }

  if (event.type === 'customer.subscription.updated') {
    const sub = event.data.object
    if (sub.status === 'canceled' || sub.status === 'unpaid') {
      await supabase.from('profiles').update({ stripe_subscription_id: null }).eq('stripe_subscription_id', sub.id)
    }
  }

  return new Response(JSON.stringify({ received: true }), { status: 200, headers: { 'Content-Type': 'application/json' } })
})
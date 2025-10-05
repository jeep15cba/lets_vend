import { getUserCompanyContext, createClient } from '../../../lib/supabase/server'

export const runtime = 'edge'

export default async function handler(req) {
  const { user, companyId, error: authError } = await getUserCompanyContext(req)

  if (!user || authError) {
    return new Response(JSON.stringify({ error: 'Authentication required' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    })
  }

  const { supabase } = createClient(req)

  // GET - Fetch current subscription
  if (req.method === 'GET') {
    try {
      const { data, error } = await supabase
        .from('company_subscription_overview')
        .select('*')
        .eq('company_id', companyId)
        .single()

      if (error) {
        console.error('Error fetching subscription:', error)
        return new Response(JSON.stringify({ error: 'Failed to fetch subscription' }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' }
        })
      }

      return new Response(JSON.stringify({ success: true, subscription: data }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      })
    } catch (error) {
      console.error('Subscription fetch error:', error)
      return new Response(JSON.stringify({ error: 'Internal server error' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      })
    }
  }

  // PUT - Update subscription (admin only)
  if (req.method === 'PUT') {
    try {
      const body = await req.json()
      const {
        tier_id,
        subscription_status,
        billing_cycle,
        is_promotional,
        promotional_notes
      } = body

      // Check if user is admin
      const { data: company, error: companyError } = await supabase
        .from('companies')
        .select('role')
        .eq('id', companyId)
        .single()

      if (companyError || company.role !== 'admin') {
        return new Response(JSON.stringify({ error: 'Admin privileges required' }), {
          status: 403,
          headers: { 'Content-Type': 'application/json' }
        })
      }

      // Get current subscription for history
      const { data: currentSub } = await supabase
        .from('companies')
        .select('subscription_tier_id, subscription_status, is_promotional')
        .eq('id', companyId)
        .single()

      // Update subscription
      const updates = {}
      if (tier_id !== undefined) updates.subscription_tier_id = tier_id
      if (subscription_status !== undefined) updates.subscription_status = subscription_status
      if (billing_cycle !== undefined) updates.billing_cycle = billing_cycle
      if (is_promotional !== undefined) updates.is_promotional = is_promotional
      if (promotional_notes !== undefined) updates.promotional_notes = promotional_notes

      const { data, error: updateError } = await supabase
        .from('companies')
        .update(updates)
        .eq('id', companyId)
        .select()
        .single()

      if (updateError) {
        console.error('Error updating subscription:', updateError)
        return new Response(JSON.stringify({ error: 'Failed to update subscription' }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' }
        })
      }

      // Record in subscription history
      await supabase.from('subscription_history').insert({
        company_id: companyId,
        tier_id: tier_id || currentSub.subscription_tier_id,
        previous_tier_id: currentSub.subscription_tier_id,
        status: subscription_status || currentSub.subscription_status,
        previous_status: currentSub.subscription_status,
        changed_by: user.id,
        billing_cycle: billing_cycle,
        is_promotional: is_promotional || currentSub.is_promotional,
        promotional_notes: promotional_notes,
        change_reason: 'Subscription updated via API'
      })

      return new Response(JSON.stringify({ success: true, subscription: data }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      })
    } catch (error) {
      console.error('Subscription update error:', error)
      return new Response(JSON.stringify({ error: 'Internal server error' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      })
    }
  }

  return new Response(JSON.stringify({ error: 'Method not allowed' }), {
    status: 405,
    headers: { 'Content-Type': 'application/json' }
  })
}

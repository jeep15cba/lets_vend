import { getUserCompanyContext, createClient } from '../../../lib/supabase/server'

export const runtime = 'edge'

export default async function handler(req) {
  if (req.method !== 'GET') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' }
    })
  }

  const { user, error: authError } = await getUserCompanyContext(req)

  if (!user || authError) {
    return new Response(JSON.stringify({ error: 'Authentication required' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    })
  }

  const { supabase } = createClient(req)

  try {
    const { data: tiers, error } = await supabase
      .from('subscription_tiers')
      .select('*')
      .eq('is_active', true)
      .order('display_order', { ascending: true })

    if (error) {
      console.error('Error fetching tiers:', error)
      return new Response(JSON.stringify({ error: 'Failed to fetch subscription tiers' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      })
    }

    // Filter out promotional tier for regular users (only show to admins)
    const filteredTiers = tiers.filter(tier => tier.name !== 'Promotional')

    return new Response(JSON.stringify({ success: true, tiers: filteredTiers }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    })
  } catch (error) {
    console.error('Tiers fetch error:', error)
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    })
  }
}

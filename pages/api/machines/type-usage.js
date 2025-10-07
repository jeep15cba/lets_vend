import { getUserCompanyContext, createClient } from '../../../lib/supabase/server'

export const runtime = 'edge'

export default async function handler(req) {
  if (req.method !== 'GET') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: {
        'Content-Type': 'application/json',
        'Allow': 'GET'
      }
    })
  }

  try {
    const { user, companyId, error: authError } = await getUserCompanyContext(req)

    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Authentication required' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      })
    }

    if (!companyId) {
      return new Response(JSON.stringify({ error: 'Company ID not found' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      })
    }

    const { supabase } = createClient(req)

    // Get count of machines by type
    const { data: machines, error } = await supabase
      .from('machines')
      .select('machine_type')
      .eq('company_id', companyId)

    if (error) {
      console.error('Error fetching machine types:', error)
      // Return empty usage instead of error - table might not have machines yet
      return new Response(JSON.stringify({ usage: {} }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      })
    }

    // Count by type
    const usage = {}
    if (machines && Array.isArray(machines)) {
      machines.forEach(machine => {
        const type = machine.machine_type || 'unknown'
        usage[type] = (usage[type] || 0) + 1
      })
    }

    return new Response(JSON.stringify({ usage }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    })

  } catch (error) {
    console.error('Error in type usage handler:', error)
    return new Response(JSON.stringify({ error: error.message || 'Internal server error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    })
  }
}

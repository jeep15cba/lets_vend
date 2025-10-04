import { getUserCompanyContext } from '../../../lib/supabase/server'
export const runtime = 'edge'

export default async function handler(req) {
  try {
    // Get user context
    const { user, companyId, role, error: authError } = await getUserCompanyContext(req)

    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Authentication required' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      })
    }

    if (req.method === 'GET') {
      // Get saved devices for the user
      try {
        // Fetch from Supabase machines table
        const { createServiceClient } = require('../../../lib/supabase/server')
        const { supabase } = createServiceClient()

        const { data: machines, error } = await supabase
          .from('machines')
          .select('*')
          .eq('company_id', companyId)
          .order('created_at', { ascending: false })

        if (error) throw error

        // Enhance machines with calculated values
        const enhancedMachines = machines.map(machine => {
          return {
            ...machine,
            // Use stored dex_last_4hrs from collect-bulk, or calculate if not present
            dex_last_4hrs: machine.dex_last_4hrs ?? (() => {
              const now = new Date()
              const fourHoursAgo = new Date(now.getTime() - 4 * 60 * 60 * 1000)
              return machine.dex_history?.filter(entry => {
                const entryTime = new Date(entry.created)
                return entryTime >= fourHoursAgo
              }).length || 0
            })(),
            // Extract temperature from latest DEX if available
            temperature: machine.latest_dex_parsed?.hybridData?.summary?.temperature || machine.temperature
          }
        })

        return new Response(JSON.stringify({
          success: true,
          devices: enhancedMachines || [],
          lastUpdated: new Date().toISOString()
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        })

      } catch (error) {
        console.error('Error fetching devices:', error)
        return new Response(JSON.stringify({
          success: false,
          error: 'Failed to fetch devices'
        }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' }
        })
      }

    } else {
      return new Response(JSON.stringify({ error: 'Method not allowed' }), {
        status: 405,
        headers: {
          'Content-Type': 'application/json',
          'Allow': 'GET'
        }
      })
    }

  } catch (error) {
    console.error('Devices API error:', error)
    return new Response(JSON.stringify({
      success: false,
      error: 'Internal server error'
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    })
  }
}
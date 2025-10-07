import { getUserCompanyContext, createClient } from '../../../lib/supabase/server'

export const runtime = 'edge'

export default async function handler(req) {
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

    // GET - Retrieve company settings
    if (req.method === 'GET') {
      const { data: company, error } = await supabase
        .from('companies')
        .select('settings')
        .eq('id', companyId)
        .maybeSingle()

      if (error) {
        console.error('Error fetching company settings:', error)
        return new Response(JSON.stringify({ error: 'Failed to fetch settings' }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' }
        })
      }

      const settings = company?.settings || { machineTypes: ['unknown', 'beverage', 'food'] }

      return new Response(JSON.stringify({ settings }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      })
    }

    // PUT - Update company settings
    if (req.method === 'PUT') {
      const body = await req.json()
      const { settings } = body

      if (!settings) {
        return new Response(JSON.stringify({ error: 'Settings object required' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        })
      }

      const { data, error } = await supabase
        .from('companies')
        .update({ settings })
        .eq('id', companyId)
        .select()
        .single()

      if (error) {
        console.error('Error updating company settings:', error)
        return new Response(JSON.stringify({ error: 'Failed to update settings' }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' }
        })
      }

      return new Response(JSON.stringify({ success: true, settings: data.settings }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      })
    }

    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: {
        'Content-Type': 'application/json',
        'Allow': 'GET, PUT'
      }
    })

  } catch (error) {
    console.error('Error in company settings handler:', error)
    return new Response(JSON.stringify({ error: error.message || 'Internal server error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    })
  }
}

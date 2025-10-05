import { createClient } from '../../../lib/supabase/server'
export const runtime = 'edge'

export default async function handler(req) {
  if (req.method !== 'GET') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' }
    })
  }

  try {
    const { supabase } = createClient(req)

    // Get the current user
    const { data: { user }, error: userError } = await supabase.auth.getUser()

    if (userError || !user) {
      return new Response(JSON.stringify({ error: 'Not authenticated' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      })
    }

    // Check if user is admin
    const role = user.user_metadata?.role || user.app_metadata?.role
    if (role !== 'admin') {
      return new Response(JSON.stringify({ error: 'Unauthorized - Admin access required' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' }
      })
    }

    // Get all user credentials to see all users and their companies
    const { data: credentials, error: credError } = await supabase
      .from('user_credentials')
      .select('user_id, company_id')
      .order('company_id')

    if (credError) {
      console.error('Error fetching user credentials:', credError)
      return new Response(JSON.stringify({ error: 'Failed to fetch users' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      })
    }

    // Get company names
    const { data: companies, error: companiesError } = await supabase
      .from('companies')
      .select('id, name')

    if (companiesError) {
      console.error('Error fetching companies:', companiesError)
    }

    // Create a map of company IDs to names
    const companyMap = {}
    if (companies) {
      companies.forEach(company => {
        companyMap[company.id] = company.name
      })
    }

    return new Response(JSON.stringify({
      success: true,
      users: credentials.map(cred => ({
        userId: cred.user_id,
        companyId: cred.company_id,
        companyName: companyMap[cred.company_id] || 'Unknown Company'
      }))
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    })

  } catch (error) {
    console.error('Error in list-users:', error)
    return new Response(JSON.stringify({ error: error.message || 'Internal server error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    })
  }
}

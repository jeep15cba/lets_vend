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

    // Get all companies directly (not filtered by user_credentials)
    const { data: companies, error: companiesError } = await supabase
      .from('companies')
      .select('id, company_name')
      .order('company_name')

    if (companiesError) {
      console.error('Error fetching companies:', companiesError)
      return new Response(JSON.stringify({ error: 'Failed to fetch companies' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      })
    }

    // Get all user_credentials to check which companies have DEX credentials saved
    const { data: credentials, error: credError } = await supabase
      .from('user_credentials')
      .select('company_id, username_encrypted, password_encrypted, site_url')

    if (credError) {
      console.error('🔧 Admin list-users: Error fetching credentials:', JSON.stringify(credError))
    }

    console.log('🔧 Admin list-users: Found companies:', companies)
    console.log('🔧 Admin list-users: Found credentials:', credentials)

    // Create a set of company IDs that have DEX credentials
    const companiesWithCredentials = new Set()
    if (credentials) {
      credentials.forEach(cred => {
        // Check if they have actual DEX credentials (not just a record)
        if (cred.username_encrypted && cred.password_encrypted && cred.site_url) {
          companiesWithCredentials.add(cred.company_id)
        }
      })
    }

    // Return all companies for impersonation with DEX status
    return new Response(JSON.stringify({
      success: true,
      users: companies.map(company => ({
        userId: null, // Not user-specific, just company impersonation
        companyId: company.id,
        companyName: company.company_name,
        hasDexCredentials: companiesWithCredentials.has(company.id)
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

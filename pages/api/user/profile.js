import { getUserCompanyContext, createClient } from '../../../lib/supabase/server'
export const runtime = 'edge'

export default async function handler(req) {
  if (req.method === 'GET') {
    return handleGet(req)
  } else if (req.method === 'PUT') {
    return handlePut(req)
  } else {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: { 'Content-Type': 'application/json' } })
  }
}

async function handleGet(req) {

  try {
    const { user, companyId, role, error: authError } = await getUserCompanyContext(req)

    if (!user || authError) {
      return new Response(JSON.stringify({ error: 'Authentication required' }), { status: 401, headers: { 'Content-Type': 'application/json' } })
    }

    console.log('🔧 Profile API - User ID:', user.id)
    console.log('🔧 Profile API - User metadata:', JSON.stringify(user.user_metadata))
    console.log('🔧 Profile API - Company ID:', companyId)

    // Fetch company information from database
    let companyName = ''
    if (companyId) {
      try {
        // Use authenticated client with proper RLS
        const { supabase } = createClient(req)

        console.log('🔧 Profile API: Querying company with ID:', companyId)

        // First, check if user has a record in user_credentials table
        const { data: userCreds, error: userCredsError } = await supabase
          .from('user_credentials')
          .select('company_id')
          .eq('user_id', user.id)
          .single()

        console.log('🔧 Profile API: User credentials record:', userCreds ? 'EXISTS' : 'MISSING')
        console.log('🔧 Profile API: User credentials company_id:', userCreds?.company_id)
        if (userCredsError) {
          console.log('🔧 Profile API: User credentials error:', userCredsError.message)
        }

        const { data: company, error: companyError } = await supabase
          .from('companies')
          .select('company_name')
          .eq('id', companyId)
          .single()

        if (company && !companyError) {
          companyName = company.company_name
          console.log('🔧 Profile API: Successfully found company name:', companyName)
        } else {
          console.warn('🔧 Profile API: RLS blocked company lookup - company_id not in JWT app_metadata:', companyError?.message)
          console.warn('🔧 Profile API: Current user_metadata has company_id:', user.user_metadata?.company_id)
          console.warn('🔧 Profile API: Current app_metadata has company_id:', user.app_metadata?.company_id)
        }
      } catch (error) {
        console.warn('🔧 Profile API: Error fetching company:', error.message)
      }
    }

    return new Response(JSON.stringify({
      user: {
        id: user.id,
        email: user.email,
        user_metadata: {
          name: user.user_metadata?.name,
          company_id: companyId,
          company_name: companyName,
          role: role,
          timezone: user.user_metadata?.timezone
        }
      },
      companyId,
      companyName,
      role
    }), { status: 200, headers: { 'Content-Type': 'application/json' } })

  } catch (error) {
    console.error('Profile API error:', error)
    return new Response(JSON.stringify({ error: 'Internal server error' }), { status: 500, headers: { 'Content-Type': 'application/json' } })
  }
}

async function handlePut(req) {
  try {
    const { user, error: authError } = await getUserCompanyContext(req)

    if (!user || authError) {
      return new Response(JSON.stringify({ error: 'Authentication required' }), { status: 401, headers: { 'Content-Type': 'application/json' } })
    }

    // Parse request body
    const body = await req.json()
    const { firstName, lastName, timezone } = body

    console.log('🔧 Profile Update API - User ID:', user.id)
    console.log('🔧 Profile Update API - Data:', { firstName, lastName, timezone })

    // Update user metadata in Supabase Auth
    const { supabase } = createClient(req)

    const updateData = {}

    // Build the metadata update object
    if (firstName !== undefined || lastName !== undefined) {
      const name = [firstName, lastName].filter(Boolean).join(' ')
      if (name) {
        updateData.name = name
      }
    }

    if (timezone !== undefined) {
      updateData.timezone = timezone
    }

    console.log('🔧 Profile Update API - Updating user metadata:', updateData)

    const { data, error } = await supabase.auth.updateUser({
      data: updateData
    })

    if (error) {
      console.error('🔧 Profile Update API - Error:', error)
      return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { 'Content-Type': 'application/json' } })
    }

    console.log('🔧 Profile Update API - Success:', data.user.user_metadata)

    return new Response(JSON.stringify({
      success: true,
      user: data.user
    }), { status: 200, headers: { 'Content-Type': 'application/json' } })

  } catch (error) {
    console.error('Profile Update API error:', error)
    return new Response(JSON.stringify({ error: 'Internal server error' }), { status: 500, headers: { 'Content-Type': 'application/json' } })
  }
}
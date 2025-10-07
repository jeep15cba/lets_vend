export const runtime = 'edge'

import { createClient } from '@supabase/supabase-js'

// Parse cookies from Edge Runtime request
function parseCookies(req) {
  const cookieHeader = req.headers.get('cookie') || ''
  const cookies = {}
  cookieHeader.split(';').forEach(cookie => {
    const [name, ...rest] = cookie.trim().split('=')
    if (name) {
      cookies[name] = rest.join('=')
    }
  })
  return cookies
}

export default async function handler(req) {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: {
        'Content-Type': 'application/json',
        'Allow': 'POST'
      }
    })
  }

  try {
    // Parse cookies from request
    const cookies = parseCookies(req)

    // Get auth tokens from cookies
    const authToken0 = cookies['sb-hkapfjibtaqmdpgxseuj-auth-token.0']
    const authToken1 = cookies['sb-hkapfjibtaqmdpgxseuj-auth-token.1']

    if (!authToken0 || !authToken1) {
      return new Response(JSON.stringify({
        error: 'Authentication required',
        details: 'No auth tokens found'
      }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      })
    }

    // Combine and decode the token
    const combinedToken = authToken0 + authToken1
    const decodedToken = JSON.parse(atob(combinedToken.replace('base64-', '')))
    const accessToken = decodedToken.access_token

    // Create Supabase client with access token
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      {
        global: {
          headers: {
            Authorization: `Bearer ${accessToken}`
          }
        }
      }
    )

    // Verify user is authenticated
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return new Response(JSON.stringify({
        error: 'Authentication required',
        details: authError?.message || 'No user found'
      }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      })
    }

    const companyId = user.user_metadata?.company_id || user.app_metadata?.company_id

    const body = await req.json()
    const { updates } = body

    if (!Array.isArray(updates) || updates.length === 0) {
      return new Response(JSON.stringify({ error: 'Invalid updates array' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      })
    }

    // Get all machines to update first (to access current location data)
    const machineIds = updates.map(u => u.id)
    const { data: machines, error: fetchError } = await supabase
      .from('machines')
      .select('id, location')
      .in('id', machineIds)
      .eq('company_id', companyId)

    if (fetchError) {
      return new Response(JSON.stringify({ error: 'Failed to fetch machines' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      })
    }

    // Get valid machine types from company settings (only active ones)
    let validTypes = ['unknown', 'beverage', 'food'] // Default fallback
    const { data: companyData } = await supabase
      .from('companies')
      .select('settings')
      .eq('id', companyId)
      .single()

    if (companyData?.settings?.machineTypes) {
      // Filter to only active types
      validTypes = companyData.settings.machineTypes
        .filter(type => typeof type === 'string' || type.active)
        .map(type => typeof type === 'string' ? type : type.name)
    }

    // Update each machine
    const updatePromises = updates.map(({ id, display_order, machine_type, machine_model, cash_enabled, location_other }) => {
      const updateData = {}

      if (display_order !== undefined && display_order !== null) {
        updateData.display_order = display_order
      }
      if (machine_type !== undefined && machine_type !== null && machine_type !== '') {
        // Only update machine_type if it's a valid value
        const trimmedType = String(machine_type).trim().toLowerCase()
        console.log(`Validating machine_type for ID ${id}: "${machine_type}" -> "${trimmedType}" Valid: ${validTypes.includes(trimmedType)} (allowed: ${validTypes.join(', ')})`)
        if (validTypes.includes(trimmedType)) {
          updateData.machine_type = trimmedType
        } else {
          console.warn(`Skipping invalid machine_type for ID ${id}: "${machine_type}" (valid types: ${validTypes.join(', ')})`)
        }
      }
      if (machine_model !== undefined && machine_model !== null) {
        updateData.machine_model = machine_model
      }
      if (cash_enabled !== undefined && cash_enabled !== null) {
        updateData.cash_enabled = cash_enabled
      }

      // Handle location_other if provided
      if (location_other !== undefined) {
        const machine = machines.find(m => m.id === id)
        if (machine) {
          updateData.location = {
            ...(machine.location || {}),
            other: location_other
          }
        }
      }

      return supabase
        .from('machines')
        .update(updateData)
        .eq('id', id)
    })

    const results = await Promise.all(updatePromises)

    // Check for errors
    const errors = results.filter(r => r.error)
    if (errors.length > 0) {
      console.error('Errors updating machines:', errors)
      return new Response(JSON.stringify({
        error: 'Failed to update some machines',
        details: errors
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      })
    }

    return new Response(JSON.stringify({
      success: true,
      updated: updates.length
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    })

  } catch (error) {
    console.error('Error importing updates:', error)
    return new Response(JSON.stringify({
      error: 'Internal server error',
      message: error.message
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    })
  }
}

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
  if (req.method !== 'PUT') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: {
        'Content-Type': 'application/json',
        'Allow': 'PUT'
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
        success: false,
        error: 'Authentication required'
      }), { status: 401, headers: { 'Content-Type': 'application/json' } })
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
        success: false,
        error: 'Authentication required'
      }), { status: 401, headers: { 'Content-Type': 'application/json' } })
    }

    const companyId = user.user_metadata?.company_id || user.app_metadata?.company_id

    const url = new URL(req.url)
    const id = url.pathname.split('/').pop()
    const { location_type, location_other, machine_type, cash_enabled } = await req.json()

    if (!id) {
      return new Response(JSON.stringify({
        success: false,
        error: 'Device ID is required'
      }), { status: 400, headers: { 'Content-Type': 'application/json' } })
    }

    // Validate input
    if (machine_type && !['unknown', 'beverage', 'food'].includes(machine_type)) {
      return new Response(JSON.stringify({
        success: false,
        error: 'Invalid machine type. Must be unknown, beverage, or food'
      }), { status: 400, headers: { 'Content-Type': 'application/json' } })
    }

    // Get current device to preserve location data
    const { data: currentDevice, error: fetchError } = await supabase
      .from('machines')
      .select('location')
      .eq('id', id)
      .eq('company_id', companyId)
      .single()

    if (fetchError || !currentDevice) {
      return new Response(JSON.stringify({
        success: false,
        error: 'Device not found'
      }), { status: 404, headers: { 'Content-Type': 'application/json' } })
    }

    // Build updated location object based on location_type
    let updatedLocation = currentDevice.location || {}

    if (location_type === 'other') {
      // Set custom location in 'other' field
      updatedLocation = {
        ...updatedLocation,
        other: location_other || null
      }
    } else {
      // Remove 'other' field when selecting streetAddress or optional
      const { other, ...rest } = updatedLocation
      updatedLocation = rest
    }

    console.log(`Updating device ${id} with:`, {
      location_type,
      location_other,
      updatedLocation,
      machine_type,
      cash_enabled
    })

    // Update the device in Supabase
    const { data, error } = await supabase
      .from('machines')
      .update({
        location: updatedLocation,
        machine_type: machine_type || 'unknown',
        cash_enabled: cash_enabled !== undefined ? cash_enabled : false,
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .eq('company_id', companyId) // Ensure user can only update their own devices
      .select()

    if (error) {
      console.error('Error updating device:', error)
      throw new Error('Failed to update device in database')
    }

    if (!data || data.length === 0) {
      return new Response(JSON.stringify({
        success: false,
        error: 'Device not found or you do not have permission to update it'
      }), { status: 404, headers: { 'Content-Type': 'application/json' } })
    }

    console.log(`Device ${id} updated successfully`)

    return new Response(JSON.stringify({
      success: true,
      message: `Device ${id} updated successfully`,
      device: data[0]
    }), { status: 200, headers: { 'Content-Type': 'application/json' } })

  } catch (error) {
    console.error('Error updating device:', error)
    return new Response(JSON.stringify({
      success: false,
      error: error.message || 'Failed to update device'
    }), { status: 500, headers: { 'Content-Type': 'application/json' } })
  }
}
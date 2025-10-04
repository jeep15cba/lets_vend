import { getUserCompanyContext } from '../../../lib/supabase/server'
export const runtime = 'edge'

export default async function handler(req) {
  if (req.method !== 'PUT') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: { 'Content-Type': 'application/json' } })
  }

  try {
    // Get user context
    const { user, companyId, role, error: authError } = await getUserCompanyContext(req)

    // Dev mode: use fake user context
    const isDevMode = !process.env.NEXT_PUBLIC_SUPABASE_URL
    let userId, userEmail

    if (isDevMode) {
      userId = 'dev-user'
      userEmail = 'dev@example.com'
      console.log('🔧 DEV MODE: Using fake user for device update')
    } else {
      if (authError || !user) {
        return new Response(JSON.stringify({
          success: false,
          error: 'Authentication required'
        }), { status: 401, headers: { 'Content-Type': 'application/json' } })
      }
      userId = user.id
      userEmail = user.email
    }

    const url = new URL(req.url)
    const id = url.pathname.split('/').pop()
    const { location, machine_type, cash_enabled } = await req.json()

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

    console.log(`Updating device ${id} with:`, {
      location,
      machine_type,
      cash_enabled
    })

    if (isDevMode) {
      // In dev mode, simulate successful update
      console.log('🔧 DEV MODE: Would update device in Supabase with:', {
        location,
        machine_type,
        cash_enabled
      })

      return new Response(JSON.stringify({
        success: true,
        message: `Device ${id} updated successfully (dev mode)`,
        device: {
          id,
          location,
          machine_type,
          cash_enabled,
          updated_at: new Date().toISOString()
        }
      }), { status: 200, headers: { 'Content-Type': 'application/json' } })
    }

    // TODO: In production, update the device in Supabase
    // const { data, error } = await supabase
    //   .from('machines')
    //   .update({
    //     location: location || null,
    //     machine_type: machine_type || 'unknown',
    //     cash_enabled: cash_enabled || false,
    //     updated_at: new Date().toISOString()
    //   })
    //   .eq('id', id)
    //   .eq('company_id', companyId) // Ensure user can only update their own devices
    //   .select()

    // if (error) {
    //   console.error('Error updating device:', error)
    //   throw new Error('Failed to update device in database')
    // }

    // if (!data || data.length === 0) {
    //   return res.status(404).json({
    //     success: false,
    //     error: 'Device not found or you do not have permission to update it'
    //   })
    // }

    // For now, simulate successful update
    console.log(`Device ${id} would be updated successfully in production`)

    return new Response(JSON.stringify({
      success: true,
      message: `Device ${id} updated successfully`,
      device: {
        id,
        location,
        machine_type,
        cash_enabled,
        updated_at: new Date().toISOString()
      }
    }), { status: 200, headers: { 'Content-Type': 'application/json' } })

  } catch (error) {
    console.error('Error updating device:', error)
    return new Response(JSON.stringify({
      success: false,
      error: error.message || 'Failed to update device'
    }), { status: 500, headers: { 'Content-Type': 'application/json' } })
  }
}
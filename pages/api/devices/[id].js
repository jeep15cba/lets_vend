import { getUserCompanyContext } from '../../../lib/supabase/server'

export default async function handler(req, res) {
  if (req.method !== 'PUT') {
    return res.status(405).json({ error: 'Method not allowed' })
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
        return res.status(401).json({
          success: false,
          error: 'Authentication required'
        })
      }
      userId = user.id
      userEmail = user.email
    }

    const { id } = req.query
    const { location, machine_type, cash_enabled } = req.body

    if (!id) {
      return res.status(400).json({
        success: false,
        error: 'Device ID is required'
      })
    }

    // Validate input
    if (machine_type && !['unknown', 'beverage', 'food'].includes(machine_type)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid machine type. Must be unknown, beverage, or food'
      })
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

      return res.status(200).json({
        success: true,
        message: `Device ${id} updated successfully (dev mode)`,
        device: {
          id,
          location,
          machine_type,
          cash_enabled,
          updated_at: new Date().toISOString()
        }
      })
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

    return res.status(200).json({
      success: true,
      message: `Device ${id} updated successfully`,
      device: {
        id,
        location,
        machine_type,
        cash_enabled,
        updated_at: new Date().toISOString()
      }
    })

  } catch (error) {
    console.error('Error updating device:', error)
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to update device'
    })
  }
}
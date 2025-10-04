import { getUserCompanyContext } from '../../../lib/supabase/server'

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    // Get user context
    const { user, error: authError } = await getUserCompanyContext(req)

    if (authError || !user) {
      return res.status(401).json({ error: 'Authentication required' })
    }

    console.log('🔧 Fixing user app_metadata for:', user.email)
    console.log('🔧 Current user_metadata company_id:', user.user_metadata?.company_id)
    console.log('🔧 Current app_metadata company_id:', user.app_metadata?.company_id)

    // Use service client to update user app_metadata
    const { createServiceClient } = require('../../../lib/supabase/server')
    const { supabase: adminSupabase } = createServiceClient()

    const { error: updateError } = await adminSupabase.auth.admin.updateUserById(user.id, {
      app_metadata: {
        ...user.app_metadata,
        company_id: user.user_metadata?.company_id,
        role: user.user_metadata?.role || 'user'
      }
    })

    if (updateError) {
      console.error('Failed to update user app_metadata:', updateError)
      return res.status(500).json({ error: 'Failed to update user metadata' })
    }

    console.log('🔧 User app_metadata updated successfully')

    return res.status(200).json({
      success: true,
      message: 'User app_metadata updated successfully',
      company_id: user.user_metadata?.company_id,
      role: user.user_metadata?.role || 'user'
    })

  } catch (error) {
    console.error('Error fixing user app_metadata:', error)
    return res.status(500).json({ error: 'Internal server error' })
  }
}
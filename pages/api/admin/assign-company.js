import { createServiceClient } from '../../../lib/supabase/server'

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const { userId, companyId } = req.body

    if (!userId || !companyId) {
      return res.status(400).json({
        error: 'Missing required fields',
        required: ['userId', 'companyId']
      })
    }

    // Use service client to bypass RLS and update user metadata
    const { supabase } = createServiceClient()

    // Update the user's metadata to include company_id
    const { data, error } = await supabase.auth.admin.updateUserById(userId, {
      user_metadata: {
        company_id: companyId
      }
    })

    if (error) {
      console.error('Error updating user metadata:', error)
      return res.status(500).json({
        error: 'Failed to update user company assignment',
        details: error.message
      })
    }

    return res.status(200).json({
      success: true,
      message: 'User company assignment updated successfully',
      user: data.user
    })

  } catch (error) {
    console.error('Admin assign company error:', error)
    return res.status(500).json({
      error: 'Internal server error',
      details: error.message
    })
  }
}
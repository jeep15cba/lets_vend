import { createServiceClient } from '../../../lib/supabase/server'

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const { email, companyId } = req.body

    if (!email || !companyId) {
      return res.status(400).json({
        error: 'Missing required fields',
        required: ['email', 'companyId']
      })
    }

    // Use service client to bypass RLS
    const { supabase } = createServiceClient()

    // 1. Find user by email
    const { data: users, error: listError } = await supabase.auth.admin.listUsers()

    if (listError) {
      console.error('Error listing users:', listError)
      return res.status(500).json({
        error: 'Failed to find user',
        details: listError.message
      })
    }

    const user = users.users.find(u => u.email === email)

    if (!user) {
      return res.status(404).json({
        error: 'User not found',
        email: email
      })
    }

    console.log('🔧 Found user:', user.id, user.email)
    console.log('🔧 Current metadata:', user.user_metadata)

    // 2. Update user metadata to include company_id
    const { data, error } = await supabase.auth.admin.updateUserById(user.id, {
      user_metadata: {
        ...user.user_metadata,
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

    console.log('✅ User company assignment updated successfully')
    console.log('🔧 New metadata:', data.user.user_metadata)

    return res.status(200).json({
      success: true,
      message: 'User company assignment updated successfully',
      user: {
        id: data.user.id,
        email: data.user.email,
        user_metadata: data.user.user_metadata
      }
    })

  } catch (error) {
    console.error('Fix user company error:', error)
    return res.status(500).json({
      error: 'Internal server error',
      details: error.message
    })
  }
}
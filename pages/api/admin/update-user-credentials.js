export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const { createServiceClient } = require('../../../lib/supabase/server')
    const { supabase: adminSupabase } = createServiceClient()

    const { userId, encryptedUsername, encryptedPassword } = req.body

    if (!userId || !encryptedUsername || !encryptedPassword) {
      return res.status(400).json({ error: 'userId, encryptedUsername, and encryptedPassword are required' })
    }

    console.log('🔧 Updating user credentials for user:', userId)

    // Update the user_credentials record with the encrypted values
    const { data, error } = await adminSupabase
      .from('user_credentials')
      .update({
        username_encrypted: encryptedUsername,
        password_encrypted: encryptedPassword,
        validation_status: 'valid',
        updated_at: new Date().toISOString()
      })
      .eq('user_id', userId)
      .select()
      .single()

    if (error) {
      console.error('Failed to update user credentials:', error)
      return res.status(500).json({ error: 'Failed to update user credentials' })
    }

    console.log('🔧 User credentials updated successfully:', data)

    return res.status(200).json({
      success: true,
      message: 'User credentials updated successfully',
      record: data
    })

  } catch (error) {
    console.error('Error updating user credentials:', error)
    return res.status(500).json({ error: 'Internal server error' })
  }
}
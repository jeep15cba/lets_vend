import { getUserCompanyContext } from '../../../lib/supabase/server'

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const { createServiceClient } = require('../../../lib/supabase/server')
    const { supabase: adminSupabase } = createServiceClient()

    // Try to get user from auth context first
    let user, companyId
    try {
      const authResult = await getUserCompanyContext(req)
      user = authResult.user
      companyId = authResult.companyId
    } catch (authError) {
      console.log('🔧 Auth context not available, checking for email parameter')
    }

    // If no user from auth, check for email parameter
    if (!user) {
      const { email } = req.body || {}
      if (!email) {
        return res.status(400).json({ error: 'User authentication or email parameter required' })
      }

      // Look up user by email using service client
      const { data: userData, error: userError } = await adminSupabase.auth.admin.listUsers()
      if (userError) {
        console.error('Error listing users:', userError)
        return res.status(500).json({ error: 'Failed to lookup user' })
      }

      user = userData.users.find(u => u.email === email)
      if (!user) {
        return res.status(404).json({ error: 'User not found' })
      }

      companyId = user.user_metadata?.company_id
    }

    console.log('🔧 Creating user_credentials record for:', user.email)
    console.log('🔧 User ID:', user.id)
    console.log('🔧 Company ID:', companyId)

    if (!companyId) {
      return res.status(400).json({ error: 'User has no company_id in metadata' })
    }

    // Use service client to insert into user_credentials table

    // Check if record already exists
    const { data: existingRecord, error: checkError } = await adminSupabase
      .from('user_credentials')
      .select('*')
      .eq('user_id', user.id)
      .single()

    if (existingRecord) {
      console.log('🔧 User credentials record already exists:', existingRecord)
      return res.status(200).json({
        success: true,
        message: 'User credentials record already exists',
        record: existingRecord
      })
    }

    if (checkError && checkError.code !== 'PGRST116') { // PGRST116 is "no rows returned"
      console.error('Error checking existing record:', checkError)
      return res.status(500).json({ error: 'Failed to check existing record' })
    }

    // Insert new record with placeholder encrypted credentials
    const { data: newRecord, error: insertError } = await adminSupabase
      .from('user_credentials')
      .insert({
        user_id: user.id,
        company_id: companyId,
        username_encrypted: 'placeholder_encrypted_username', // User needs to set real credentials
        password_encrypted: 'placeholder_encrypted_password', // User needs to set real credentials
        validation_status: 'pending',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .select()
      .single()

    if (insertError) {
      console.error('Failed to create user_credentials record:', insertError)
      return res.status(500).json({ error: 'Failed to create user credentials record' })
    }

    console.log('🔧 User credentials record created successfully:', newRecord)

    return res.status(200).json({
      success: true,
      message: 'User credentials record created successfully',
      record: newRecord
    })

  } catch (error) {
    console.error('Error creating user_credentials record:', error)
    return res.status(500).json({ error: 'Internal server error' })
  }
}
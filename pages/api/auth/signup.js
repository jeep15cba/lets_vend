import { createServiceClient } from '../../../lib/supabase/server'

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { email, password, metadata = {} } = req.body

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' })
  }

  try {
    const { supabase } = createServiceClient()

    // 1. Create the user account first
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true, // Auto-confirm for dev
      user_metadata: {
        name: metadata.name,
        role: metadata.role || 'user'
      }
    })

    if (authError) {
      console.error('Auth error:', authError)
      return res.status(400).json({ error: authError.message })
    }

    // 2. Create company record if company_name provided
    let companyId = null
    if (metadata.company_name) {
      const { data: companyData, error: companyError } = await supabase
        .from('companies')
        .insert({
          company_name: metadata.company_name,
          company_code: metadata.company_name.toUpperCase().replace(/\s+/g, ''),
          is_active: true
        })
        .select()
        .single()

      if (companyError) {
        console.error('Company creation error:', companyError)
        // If company creation fails, we should clean up the user
        await supabase.auth.admin.deleteUser(authData.user.id)
        return res.status(400).json({ error: 'Failed to create company' })
      }

      companyId = companyData.id
    }

    // 3. Update user metadata with company_id (in app_metadata for RLS)
    if (companyId) {
      const { error: updateError } = await supabase.auth.admin.updateUserById(
        authData.user.id,
        {
          app_metadata: {
            company_id: companyId,
            role: metadata.role || 'user'
          },
          user_metadata: {
            ...authData.user.user_metadata,
            company_id: companyId  // Also keep in user_metadata for backwards compatibility
          }
        }
      )

      if (updateError) {
        console.error('User update error:', updateError)
        return res.status(400).json({ error: 'Failed to link user to company' })
      }
    }

    console.log('✅ User signup successful:', {
      userId: authData.user.id,
      email: authData.user.email,
      companyId
    })

    return res.status(200).json({
      success: true,
      user: authData.user,
      message: 'Account created successfully'
    })

  } catch (error) {
    console.error('Signup error:', error)
    return res.status(500).json({ error: 'Internal server error' })
  }
}
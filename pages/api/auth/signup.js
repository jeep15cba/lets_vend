import { createServiceClient } from '../../../lib/supabase/server'
export const runtime = 'edge'

export default async function handler(req) {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: { 'Content-Type': 'application/json' } })
  }

  const { email, password, metadata = {} } = await req.json()

  if (!email || !password) {
    return new Response(JSON.stringify({ error: 'Email and password are required' }), { status: 400, headers: { 'Content-Type': 'application/json' } })
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
      return new Response(JSON.stringify({ error: authError.message }), { status: 400, headers: { 'Content-Type': 'application/json' } })
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
        return new Response(JSON.stringify({ error: 'Failed to create company' }), { status: 400, headers: { 'Content-Type': 'application/json' } })
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
        return new Response(JSON.stringify({ error: 'Failed to link user to company' }), { status: 400, headers: { 'Content-Type': 'application/json' } })
      }
    }

    console.log('✅ User signup successful:', {
      userId: authData.user.id,
      email: authData.user.email,
      companyId
    })

    return new Response(JSON.stringify({
      success: true,
      user: authData.user,
      message: 'Account created successfully'
    }), { status: 200, headers: { 'Content-Type': 'application/json' } })

  } catch (error) {
    console.error('Signup error:', error)
    return new Response(JSON.stringify({ error: 'Internal server error' }), { status: 500, headers: { 'Content-Type': 'application/json' } })
  }
}
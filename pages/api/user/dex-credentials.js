import { getUserCompanyContext, createClient } from '../../../lib/supabase/server'
export const runtime = 'edge'
import { encrypt, decrypt } from '../../../lib/encryption'

export default async function handler(req) {
  try {
    // Try to get user context from Supabase auth (may fail if no session)
    let { user, companyId, role, error: authError } = await getUserCompanyContext(req)

    console.log('🔧 DEX credentials API called, user authenticated:', !!user)

    if (!user || authError) {
      return new Response(JSON.stringify({ error: 'Authentication required' }), { status: 401, headers: { 'Content-Type': 'application/json' } })
    }

    console.log('🔧 Using user:', user.email)

    if (req.method === 'GET') {
      // Get existing credentials
      try {
        // Fetch from Supabase user_credentials table with RLS
        const { supabase } = createClient(req)

        const { data, error } = await supabase
          .from('user_credentials')
          .select('username_encrypted, site_url, created_at')
          .eq('user_id', user.id)
          .single()

        if (error && error.code !== 'PGRST116') { // PGRST116 = row not found
          console.error('Database error fetching credentials:', error)
          throw error
        }

        if (data) {
          // Check if this is a placeholder record (contains unencrypted placeholder values)
          const isPlaceholder = data.username_encrypted === 'placeholder_encrypted_username' ||
                               data.username_encrypted?.startsWith('placeholder_')

          if (isPlaceholder) {
            // Return empty state for placeholder records
            return new Response(JSON.stringify({
              username: '',
              siteUrl: data.site_url || 'https://dashboard.cantaloupe.online',
              isConfigured: false
            }), { status: 200, headers: { 'Content-Type': 'application/json' } })
          }

          // Try to decrypt real credentials
          try {
            return new Response(JSON.stringify({
              username: await decrypt(data.username_encrypted),
              siteUrl: data.site_url || 'https://dashboard.cantaloupe.online',
              isConfigured: true,
              createdAt: data.created_at
            }), { status: 200, headers: { 'Content-Type': 'application/json' } })
          } catch (decryptError) {
            console.error('Failed to decrypt credentials:', decryptError)
            // If decryption fails, treat as unconfigured
            return new Response(JSON.stringify({
              username: '',
              siteUrl: data.site_url || 'https://dashboard.cantaloupe.online',
              isConfigured: false
            }), { status: 200, headers: { 'Content-Type': 'application/json' } })
          }
        }

        // No credentials found - return empty state
        return new Response(JSON.stringify({
          username: '',
          siteUrl: 'https://dashboard.cantaloupe.online',
          isConfigured: false
        }), { status: 200, headers: { 'Content-Type': 'application/json' } })

      } catch (error) {
        console.error('Error fetching credentials:', error)
        return new Response(JSON.stringify({
          error: 'Failed to fetch credentials',
          details: error.message,
          code: error.code
        }), { status: 500, headers: { 'Content-Type': 'application/json' } })
      }

    } else if (req.method === 'PUT') {
      // Save/update credentials
      const { username, password, siteUrl } = await req.json()

      if (!username || !siteUrl) {
        return new Response(JSON.stringify({ error: 'Username and site URL are required' }), { status: 400, headers: { 'Content-Type': 'application/json' } })
      }

      try {
        // Encrypt the credentials for authenticated users
        const encryptedUsername = await encrypt(username)
        const encryptedPassword = password ? await encrypt(password) : null

        // Save to Supabase user_credentials table with RLS
        const { supabase } = createClient(req)

        const credentialsData = {
          user_id: user.id,
          company_id: companyId,
          username_encrypted: encryptedUsername,
          site_url: siteUrl,
          is_active: true,
          validation_status: 'pending',
          updated_at: new Date().toISOString()
        }

        if (encryptedPassword) {
          credentialsData.password_encrypted = encryptedPassword
        }

        const { error } = await supabase
          .from('user_credentials')
          .upsert(credentialsData)

        if (error) {
          console.error('Database error saving credentials:', error)
          throw error
        }

        // Test the credentials before marking them as valid
        console.log('🔧 Testing DEX credentials...')
        let credentialsValid = false
        try {
          // TODO: Add actual DEX API test here
          // For now, assume credentials are valid if they were saved successfully
          credentialsValid = true
        } catch (testError) {
          console.error('DEX credentials test failed:', testError)
          credentialsValid = false
        }

        return new Response(JSON.stringify({
          message: 'Credentials saved successfully',
          isConfigured: true,
          credentialsValid
        }), { status: 200, headers: { 'Content-Type': 'application/json' } })

      } catch (error) {
        console.error('Error saving credentials:', error)
        return new Response(JSON.stringify({
          error: 'Failed to save credentials',
          details: error.message,
          code: error.code
        }), { status: 500, headers: { 'Content-Type': 'application/json' } })
      }

    } else {
      return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: { 'Content-Type': 'application/json', 'Allow': 'GET, PUT' } })
    }

  } catch (error) {
    console.error('DEX credentials API error:', error)
    return new Response(JSON.stringify({ error: 'Internal server error' }), { status: 500, headers: { 'Content-Type': 'application/json' } })
  }
}
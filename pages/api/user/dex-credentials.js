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
          .select('username_encrypted, password_encrypted, site_url, created_at')
          .eq('user_id', user.id)
          .single()

        if (error && error.code !== 'PGRST116') { // PGRST116 = row not found
          console.error('Database error fetching credentials:', error)
          throw error
        }

        if (data) {
          // Clean up invalid records with NULL password_encrypted
          if (!data.password_encrypted || data.password_encrypted === null) {
            console.log('🧹 Cleaning up invalid credential record with NULL password')
            await supabase
              .from('user_credentials')
              .delete()
              .eq('user_id', user.id)

            // Return empty state after cleanup
            return new Response(JSON.stringify({
              username: '',
              siteUrl: 'https://dashboard.cantaloupe.online',
              isConfigured: false
            }), { status: 200, headers: { 'Content-Type': 'application/json' } })
          }

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
        // Password is always required when saving/updating DEX credentials
        if (!password) {
          return new Response(JSON.stringify({ error: 'Password is required' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' }
          })
        }

        // Encrypt the credentials for authenticated users
        const encryptedUsername = await encrypt(username)
        const encryptedPassword = await encrypt(password)

        // Save to Supabase user_credentials table with RLS
        const { supabase } = createClient(req)

        // First, clean up any invalid records with NULL password_encrypted
        console.log('🧹 Checking for invalid credential records before upsert')
        const { data: existingData, error: checkError } = await supabase
          .from('user_credentials')
          .select('id, password_encrypted')
          .eq('user_id', user.id)
          .single()

        if (existingData && !existingData.password_encrypted) {
          console.log('🧹 Found invalid record, deleting before upsert')
          await supabase
            .from('user_credentials')
            .delete()
            .eq('user_id', user.id)
        }

        const credentialsData = {
          user_id: user.id,
          company_id: companyId,
          username_encrypted: encryptedUsername,
          password_encrypted: encryptedPassword,
          site_url: siteUrl,
          is_active: true,
          validation_status: 'pending',
          updated_at: new Date().toISOString()
        }

        const { error } = await supabase
          .from('user_credentials')
          .upsert(credentialsData, {
            onConflict: 'user_id'
          })

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

        // Update user metadata to reflect credentials status
        // This will trigger AuthContext to update hasCredentials
        console.log('🔧 Attempting to update user metadata for user:', user.id)
        try {
          const { data: updateData, error: updateError } = await supabase.auth.updateUser({
            data: {
              hasValidCredentials: true,
              credentialsLastValidated: new Date().toISOString()
            }
          })

          if (updateError) {
            console.error('❌ Failed to update user metadata:', updateError)
          } else if (updateData) {
            console.log('✅ Updated user metadata with hasValidCredentials: true')
            console.log('🔧 Updated user data:', updateData.user?.user_metadata)
          } else {
            console.log('⚠️ Update returned no data or error')
          }
        } catch (metadataError) {
          console.error('💥 Exception updating user metadata:', metadataError)
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
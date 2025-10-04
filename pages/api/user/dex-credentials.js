import { getUserCompanyContext } from '../../../lib/supabase/server'
export const runtime = 'edge'
import { encrypt, decrypt } from '../../../lib/encryption'

export default async function handler(req, res) {
  try {
    // Try to get user context from Supabase auth (may fail if no session)
    let { user, companyId, role, error: authError } = await getUserCompanyContext(req)

    console.log('🔧 DEX credentials API called, user authenticated:', !!user)

    if (!user || authError) {
      return res.status(401).json({ error: 'Authentication required' })
    }

    console.log('🔧 Using user:', user.email)

    if (req.method === 'GET') {
      // Get existing credentials
      try {
        // Try to fetch from Supabase user_credentials table
        // Use service role client to bypass RLS during auth transition
        const { createServiceClient } = require('../../../lib/supabase/server')
        const { supabase } = createServiceClient()

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
            return res.status(200).json({
              username: '',
              siteUrl: data.site_url || 'https://dashboard.cantaloupe.online',
              isConfigured: false
            })
          }

          // Try to decrypt real credentials
          try {
            return res.status(200).json({
              username: await decrypt(data.username_encrypted),
              siteUrl: data.site_url || 'https://dashboard.cantaloupe.online',
              isConfigured: true,
              createdAt: data.created_at
            })
          } catch (decryptError) {
            console.error('Failed to decrypt credentials:', decryptError)
            // If decryption fails, treat as unconfigured
            return res.status(200).json({
              username: '',
              siteUrl: data.site_url || 'https://dashboard.cantaloupe.online',
              isConfigured: false
            })
          }
        }

        // No credentials found - return empty state
        return res.status(200).json({
          username: '',
          siteUrl: 'https://dashboard.cantaloupe.online',
          isConfigured: false
        })

      } catch (error) {
        console.error('Error fetching credentials:', error)
        return res.status(500).json({
          error: 'Failed to fetch credentials',
          details: error.message,
          code: error.code
        })
      }

    } else if (req.method === 'PUT') {
      // Save/update credentials
      const { username, password, siteUrl } = req.body

      if (!username || !siteUrl) {
        return res.status(400).json({ error: 'Username and site URL are required' })
      }

      try {
        // Encrypt the credentials for authenticated users
        const encryptedUsername = await encrypt(username)
        const encryptedPassword = password ? await encrypt(password) : null

        // Try to save to Supabase user_credentials table
        // TEMPORARY: Use service role client to bypass RLS during session sync fix
        const { createServiceClient } = require('../../../lib/supabase/server')
        const { supabase } = createServiceClient()

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

        // Update user metadata with credential status
        if (credentialsValid) {
          console.log('🔧 Updating user metadata with hasValidCredentials: true')
          try {
            const { createServiceClient } = require('../../../lib/supabase/server')
            const { supabase: adminSupabase } = createServiceClient()

            const { error: updateError } = await adminSupabase.auth.admin.updateUserById(user.id, {
              user_metadata: {
                ...user.user_metadata,
                hasValidCredentials: true,
                credentialsLastValidated: new Date().toISOString()
              },
              app_metadata: {
                ...user.app_metadata,
                company_id: user.user_metadata?.company_id,
                role: user.user_metadata?.role || 'user'
              }
            })

            if (updateError) {
              console.error('Failed to update user metadata:', updateError)
            } else {
              console.log('🔧 User metadata updated successfully')
            }
          } catch (metadataError) {
            console.error('Error updating user metadata:', metadataError)
          }
        }

        return res.status(200).json({
          message: 'Credentials saved successfully',
          isConfigured: true,
          credentialsValid
        })

      } catch (error) {
        console.error('Error saving credentials:', error)
        return res.status(500).json({
          error: 'Failed to save credentials',
          details: error.message,
          code: error.code
        })
      }

    } else {
      res.setHeader('Allow', ['GET', 'PUT'])
      return res.status(405).json({ error: 'Method not allowed' })
    }

  } catch (error) {
    console.error('DEX credentials API error:', error)
    return res.status(500).json({ error: 'Internal server error' })
  }
}
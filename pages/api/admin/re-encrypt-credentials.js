import { createServiceClient } from '../../../lib/supabase/server'
import { encrypt, decrypt } from '../../../lib/encryption'

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    console.log('🔐 Starting credential re-encryption...')

    // Use credentials from environment variables
    const newUsername = process.env.CANTALOUPE_USERNAME
    const newPassword = process.env.CANTALOUPE_PASSWORD

    if (!newUsername || !newPassword) {
      return res.status(400).json({
        error: 'CANTALOUPE_USERNAME and CANTALOUPE_PASSWORD must be set in environment variables'
      })
    }

    console.log('Using credentials from environment variables')

    const { supabase } = createServiceClient()

    // Get all user credentials
    const { data: credentials, error: fetchError } = await supabase
      .from('user_credentials')
      .select('*')

    if (fetchError) {
      console.error('Error fetching credentials:', fetchError)
      throw fetchError
    }

    console.log(`Found ${credentials.length} credential records to re-encrypt`)

    const results = []

    for (const cred of credentials) {
      try {
        // Encrypt with new key
        const newEncryptedUsername = encrypt(newUsername)
        const newEncryptedPassword = encrypt(newPassword)

        // Update the record
        const { error: updateError } = await supabase
          .from('user_credentials')
          .update({
            username_encrypted: newEncryptedUsername,
            password_encrypted: newEncryptedPassword,
            validation_status: 'pending',
            updated_at: new Date().toISOString()
          })
          .eq('id', cred.id)

        if (updateError) {
          console.error(`Error updating credential ${cred.id}:`, updateError)
          results.push({
            id: cred.id,
            user_id: cred.user_id,
            success: false,
            error: updateError.message
          })
        } else {
          console.log(`✅ Successfully re-encrypted credentials for user ${cred.user_id}`)
          results.push({
            id: cred.id,
            user_id: cred.user_id,
            success: true
          })
        }
      } catch (error) {
        console.error(`Error processing credential ${cred.id}:`, error)
        results.push({
          id: cred.id,
          user_id: cred.user_id,
          success: false,
          error: error.message
        })
      }
    }

    const successCount = results.filter(r => r.success).length
    const failCount = results.filter(r => !r.success).length

    return res.status(200).json({
      success: true,
      message: `Re-encryption complete: ${successCount} succeeded, ${failCount} failed`,
      results
    })

  } catch (error) {
    console.error('🔐 Re-encryption error:', error)
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to re-encrypt credentials'
    })
  }
}

import { createClient } from '../../../lib/supabase/server'
export const runtime = 'edge'
import { encrypt, decrypt } from '../../../lib/encryption'

export default async function handler(req) {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: { 'Content-Type': 'application/json' } })
  }

  try {
    console.log('🔐 Starting credential re-encryption...')

    // Use credentials from environment variables
    const newUsername = process.env.CANTALOUPE_USERNAME
    const newPassword = process.env.CANTALOUPE_PASSWORD

    if (!newUsername || !newPassword) {
      return new Response(JSON.stringify({
        error: 'CANTALOUPE_USERNAME and CANTALOUPE_PASSWORD must be set in environment variables'
      }), { status: 400, headers: { 'Content-Type': 'application/json' } })
    }

    console.log('Using credentials from environment variables')

    const { supabase } = createClient(req)

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
        const newEncryptedUsername = await encrypt(newUsername)
        const newEncryptedPassword = await encrypt(newPassword)

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

    return new Response(JSON.stringify({
      success: true,
      message: `Re-encryption complete: ${successCount} succeeded, ${failCount} failed`,
      results
    }), { status: 200, headers: { 'Content-Type': 'application/json' } })

  } catch (error) {
    console.error('🔐 Re-encryption error:', error)
    return new Response(JSON.stringify({
      success: false,
      error: error.message || 'Failed to re-encrypt credentials'
    }), { status: 500, headers: { 'Content-Type': 'application/json' } })
  }
}

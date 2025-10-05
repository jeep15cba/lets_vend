import { createServiceClient } from '../../../lib/supabase/service'
export const runtime = 'edge'

/**
 * Updates the dex_last_4hrs flag for all machines based on their dex_history
 * This runs after DEX collection to ensure accurate status
 */
export default async function handler(req) {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' }
    })
  }

  try {
    // Require service-level authentication
    const serviceKey = req.headers.get('X-Service-Key')
    if (!serviceKey || serviceKey !== process.env.SERVICE_API_KEY) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      })
    }

    const supabase = createServiceClient()

    console.log('🕐 Updating 4-hour DEX flags for all machines...')

    // Get all machines with their dex_history
    const { data: machines, error: fetchError } = await supabase
      .from('machines')
      .select('id, case_serial, dex_history')

    if (fetchError) {
      throw new Error(`Failed to fetch machines: ${fetchError.message}`)
    }

    console.log(`Found ${machines?.length || 0} machines to check`)

    // Current time in UTC
    const now = new Date()
    const fourHoursAgo = new Date(now.getTime() - (4 * 60 * 60 * 1000))

    const updates = []
    let hasRecentCount = 0
    let noRecentCount = 0

    for (const machine of machines || []) {
      const dexHistory = machine.dex_history || []

      // Check if any DEX capture in history is within last 4 hours
      const hasRecentDex = dexHistory.some(entry => {
        const createdDate = new Date(entry.created)
        return createdDate > fourHoursAgo
      })

      // Update the flag
      updates.push({
        id: machine.id,
        dex_last_4hrs: hasRecentDex ? 'Yes' : 'No'
      })

      if (hasRecentDex) {
        hasRecentCount++
      } else {
        noRecentCount++
      }
    }

    // Batch update all machines
    if (updates.length > 0) {
      const { error: updateError } = await supabase
        .from('machines')
        .upsert(updates, {
          onConflict: 'id'
        })

      if (updateError) {
        throw new Error(`Failed to update machines: ${updateError.message}`)
      }
    }

    console.log(`✅ Updated 4-hour flags: ${hasRecentCount} with recent DEX, ${noRecentCount} without`)

    return new Response(JSON.stringify({
      success: true,
      total: machines?.length || 0,
      hasRecentDex: hasRecentCount,
      noRecentDex: noRecentCount
    }), {
      headers: { 'Content-Type': 'application/json' }
    })

  } catch (error) {
    console.error('❌ Error updating 4-hour flags:', error)
    return new Response(JSON.stringify({
      success: false,
      error: error.message
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    })
  }
}

import { getUserCompanyContext, createClient } from '../../../lib/supabase/server'
export const runtime = 'edge'

export default async function handler(req) {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: { 'Content-Type': 'application/json' } })
  }

  // Force recompile to ensure bulk collection is used

  try {
    console.log('🕐 DEX Scheduler: Starting 5-minute collection cycle...')

    // This endpoint can be called by a cron job or external scheduler
    // For now, we'll simulate getting all active machines and collecting their DEX data

    const isDevMode = !process.env.NEXT_PUBLIC_SUPABASE_URL

    if (isDevMode) {
      console.log('🔧 DEV MODE: Simulating DEX collection for all machines')

      // In dev mode, simulate some machines
      const mockMachines = [
        { device_id: '123456', case_serial: 'VM001' },
        { device_id: '789012', case_serial: 'VM002' },
        { device_id: '345678', case_serial: 'VM003' }
      ]

      let totalCollected = 0

      for (const machine of mockMachines) {
        try {
          console.log(`🔧 DEV MODE: Simulating DEX collection for machine ${machine.device_id}`)

          // Simulate successful collection
          const recordsCollected = Math.floor(Math.random() * 5) // 0-4 records
          totalCollected += recordsCollected

          console.log(`🔧 DEV MODE: Collected ${recordsCollected} records for machine ${machine.device_id}`)
        } catch (error) {
          console.error(`🔧 DEV MODE: Error simulating collection for machine ${machine.device_id}:`, error)
        }
      }

      return new Response(JSON.stringify({
        success: true,
        message: `DEX collection cycle completed (dev mode)`,
        machinesProcessed: mockMachines.length,
        totalRecordsCollected: totalCollected
      }), { status: 200, headers: { 'Content-Type': 'application/json' } })
    }

    // Get user context from Supabase auth
    const { user, companyId, error: authError } = await getUserCompanyContext(req)

    if (authError || !user) {
      console.log('DEX Scheduler: No authenticated user, skipping collection')
      return new Response(JSON.stringify({
        success: true,
        message: 'No authenticated user for DEX collection',
        machinesProcessed: 0,
        totalRecordsCollected: 0
      }), { status: 200, headers: { 'Content-Type': 'application/json' } })
    }

    // Get all active machines from Supabase for this company with RLS
    const { supabase } = createClient(req)

    const { data: machines, error } = await supabase
      .from('machines')
      .select('id, case_serial, machine_model, status')
      .eq('company_id', companyId)
      .eq('status', 'active')

    if (error) {
      console.error('Error fetching machines:', error)
      throw error
    }

    if (machines.length === 0) {
      console.log('No active machines found for DEX collection')
      return new Response(JSON.stringify({
        success: true,
        message: 'No active machines found for DEX collection',
        machinesProcessed: 0,
        totalRecordsCollected: 0
      }), { status: 200, headers: { 'Content-Type': 'application/json' } })
    }

    console.log(`Found ${machines.length} active machines for bulk DEX collection`)

    // Use bulk collection endpoint instead of individual machine requests
    let totalCollected = 0
    const errors = []

    try {
      console.log('Starting bulk DEX data collection for all machines...')

      // Make internal API call to collect DEX data in bulk
      const baseUrl = req.headers.origin || process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_LOCAL_URL || 'http://localhost:3000'
      const collectResponse = await fetch(`${baseUrl}/api/dex/collect-bulk`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          // Forward auth headers for authentication
          'Cookie': req.headers.cookie || ''
        }
      })

      const collectResult = await collectResponse.json()

      if (collectResult.success) {
        totalCollected = collectResult.recordsCount || 0
        const machinesUpdated = collectResult.machinesUpdated || 0
        console.log(`✅ Bulk collection successful: ${totalCollected} DEX records collected for ${machinesUpdated} machines`)

        if (collectResult.errors && collectResult.errors.length > 0) {
          console.log(`⚠️ Some errors occurred during bulk collection:`, collectResult.errors)
          errors.push(...collectResult.errors)
        }
      } else {
        throw new Error(collectResult.error || 'Bulk collection failed')
      }
    } catch (error) {
      console.error(`❌ Error during bulk DEX collection:`, error.message)
      errors.push({
        type: 'bulk_collection',
        error: error.message
      })
    }

    const successCount = totalCollected > 0 ? 1 : 0 // Bulk collection is either success or failure

    console.log(`🕐 DEX Scheduler: Cycle completed. Processed ${machines.length} machines, ${successCount} successful, ${errors.length} errors`)

    return new Response(JSON.stringify({
      success: true,
      message: `DEX collection cycle completed`,
      machinesProcessed: machines.length,
      successfulCollections: successCount,
      totalRecordsCollected: totalCollected,
      errors: errors.length > 0 ? errors : undefined
    }), { status: 200, headers: { 'Content-Type': 'application/json' } })

  } catch (error) {
    console.error('🕐 DEX Scheduler: Error during collection cycle:', error)
    return new Response(JSON.stringify({
      success: false,
      error: error.message || 'Failed to run DEX collection cycle'
    }), { status: 500, headers: { 'Content-Type': 'application/json' } })
  }
}
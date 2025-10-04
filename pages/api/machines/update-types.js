// API endpoint to mass update machine types and models from mapping file
import { createServiceClient } from '../../../lib/supabase/server'
import deviceMachineTypes from '../../../data/machine-types-mapping.js'

export const runtime = 'edge'

export default async function handler(req) {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' }
    })
  }

  try {
    // Import the machine types mapping (now using ES6 import at top)

    const { supabase } = createServiceClient()

    // Get all machines from the database
    const { data: machines, error: fetchError } = await supabase
      .from('machines')
      .select('id, case_serial, type, model')

    if (fetchError) {
      console.error('Error fetching machines:', fetchError)
      return new Response(JSON.stringify({
        success: false,
        error: 'Failed to fetch machines',
        details: fetchError.message
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      })
    }

    const updates = []
    const skipped = []

    // Process each machine
    for (const machine of machines) {
      const mapping = deviceMachineTypes[machine.case_serial]

      if (mapping) {
        // Check if update is needed
        if (machine.type !== mapping.type || machine.model !== mapping.model) {
          updates.push({
            id: machine.id,
            case_serial: machine.case_serial,
            old: { type: machine.type, model: machine.model },
            new: { type: mapping.type, model: mapping.model }
          })

          // Update the machine in Supabase
          const { error: updateError } = await supabase
            .from('machines')
            .update({
              type: mapping.type,
              model: mapping.model
            })
            .eq('id', machine.id)

          if (updateError) {
            console.error(`Error updating machine ${machine.case_serial}:`, updateError)
          }
        }
      } else {
        skipped.push({
          case_serial: machine.case_serial,
          reason: 'No mapping found'
        })
      }
    }

    return new Response(JSON.stringify({
      success: true,
      message: 'Machine types and models updated',
      totalMachines: machines.length,
      updated: updates.length,
      skippedCount: skipped.length,
      updates,
      skipped
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    })

  } catch (error) {
    console.error('Error in update-types:', error)
    return new Response(JSON.stringify({
      success: false,
      error: error.message
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    })
  }
}

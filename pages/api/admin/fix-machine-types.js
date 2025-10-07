import { createServiceClient } from '../../../lib/supabase/service'
export const runtime = 'edge'

export default async function handler(req) {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' }
    })
  }

  try {
    console.log('🔧 Starting machine_type fix...')
    // Use service client to bypass RLS for admin operation
    const supabase = createServiceClient()

    // Step 1: Update all 'snack' values to 'food'
    const { data: updateData, error: updateError } = await supabase
      .from('machines')
      .update({ machine_type: 'food' })
      .eq('machine_type', 'snack')
      .select()

    if (updateError) {
      console.error('Error updating snack values:', updateError)
      throw updateError
    }

    console.log(`✅ Updated ${updateData?.length || 0} machines from 'snack' to 'food'`)

    return new Response(JSON.stringify({
      success: true,
      message: `Updated ${updateData?.length || 0} machines from 'snack' to 'food'`,
      updatedMachines: updateData
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    })

  } catch (error) {
    console.error('Error fixing machine types:', error)
    return new Response(JSON.stringify({
      success: false,
      error: error.message || 'Failed to fix machine types'
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    })
  }
}

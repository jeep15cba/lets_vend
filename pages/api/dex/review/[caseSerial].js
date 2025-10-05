import { getUserCompanyContext, createClient } from '../../../../lib/supabase/server'
export const runtime = 'edge'

export default async function handler(req) {
  if (req.method !== 'GET') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' }
    })
  }

  try {
    const { user, companyId, error: authError } = await getUserCompanyContext(req)

    if (!user || authError) {
      return new Response(JSON.stringify({ error: 'Authentication required' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      })
    }

    // Get caseSerial from URL
    const url = new URL(req.url)
    const pathParts = url.pathname.split('/')
    const caseSerial = decodeURIComponent(pathParts[pathParts.length - 1])

    if (!caseSerial) {
      return new Response(JSON.stringify({ error: 'Case serial is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      })
    }

    const { supabase } = createClient(req)

    // First, get the machine to access dex_history and details
    const { data: machine, error: machineError } = await supabase
      .from('machines')
      .select('dex_history, location, machine_model, machine_type')
      .eq('case_serial', caseSerial)
      .eq('company_id', companyId)
      .single()

    if (machineError || !machine) {
      console.error('Error fetching machine:', machineError)
      return new Response(JSON.stringify({ error: 'Machine not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      })
    }

    // Parse dex_history and get the last 4 dexIds
    const dexHistory = typeof machine.dex_history === 'string'
      ? JSON.parse(machine.dex_history)
      : machine.dex_history

    if (!dexHistory || dexHistory.length === 0) {
      return new Response(JSON.stringify({
        success: true,
        records: []
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      })
    }

    // Get the last 4 dexIds
    const last4DexIds = dexHistory.slice(0, 4).map(entry => entry.dexId)

    // Get the DEX records from dex_captures using the dexIds
    const { data: records, error: dexError } = await supabase
      .from('dex_captures')
      .select('id, raw_content, created_at, dex_id')
      .in('dex_id', last4DexIds)
      .eq('company_id', companyId)
      .order('created_at', { ascending: false })

    if (dexError) {
      console.error('Error fetching DEX records:', JSON.stringify(dexError))
      return new Response(JSON.stringify({ error: 'Failed to fetch DEX records', details: dexError.message }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      })
    }

    return new Response(JSON.stringify({
      success: true,
      machine: {
        location: machine.location?.optional || null,
        model: machine.machine_model,
        type: machine.machine_type
      },
      records: records || []
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    })

  } catch (error) {
    console.error('Error in review DEX API:', error)
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    })
  }
}

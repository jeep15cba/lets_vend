// API endpoint to get parsed DEX data summary for device cards
export const runtime = 'edge'
import { getUserCompanyContext } from '../../../lib/supabase/server'

export default async function handler(req) {
  if (req.method !== 'GET') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: { 'Content-Type': 'application/json' } })
  }

  try {
    // Get user context from Supabase auth
    const { user, companyId, error: authError } = await getUserCompanyContext(req)

    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Authentication required' }), { status: 401, headers: { 'Content-Type': 'application/json' } })
    }

    const url = new URL(req.url)
    const case_serial = url.searchParams.get('case_serial')

    if (!case_serial) {
      return new Response(JSON.stringify({ error: 'case_serial parameter is required' }), { status: 400, headers: { 'Content-Type': 'application/json' } })
    }

    // Get database connection
    const { createServiceClient } = require('../../../lib/supabase/server')
    const { supabase } = createServiceClient()

    // Get the machine for this company
    const { data: machine, error: machineError } = await supabase
      .from('machines')
      .select('id, case_serial, company_id')
      .eq('case_serial', case_serial)
      .eq('company_id', companyId)
      .single()

    if (machineError || !machine) {
      return new Response(JSON.stringify({
        success: false,
        error: 'Machine not found or access denied'
      }), { status: 404, headers: { 'Content-Type': 'application/json' } })
    }

    // Get the latest DEX capture for this machine with parsed data
    const { data: latestDex, error: dexError } = await supabase
      .from('dex_captures')
      .select('dex_id, raw_content, parsed_data, has_errors, created_at')
      .eq('machine_id', machine.id)
      .eq('company_id', companyId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single()

    if (dexError) {
      console.error('Error fetching DEX data:', dexError)
      return new Response(JSON.stringify({
        success: true,
        hasData: false,
        message: 'No DEX data available for this machine'
      }), { status: 200, headers: { 'Content-Type': 'application/json' } })
    }

    if (!latestDex) {
      return new Response(JSON.stringify({
        success: true,
        hasData: false,
        message: 'No DEX data found'
      }), { status: 200, headers: { 'Content-Type': 'application/json' } })
    }

    // Extract hybrid data for device card display
    const parsedData = latestDex.parsed_data
    const hybridData = parsedData?.hybridData
    const deviceCardData = parsedData?.deviceCardData

    if (!hybridData) {
      return new Response(JSON.stringify({
        success: true,
        hasData: true,
        summary: {
          totalSales: '0.00',
          totalVends: '0',
          cashInBox: '0.00',
          temperature: null,
          machineModel: 'Unknown',
          latestEvent: null,
          latestMa5Error: null,
          hasEvents: false,
          hasMa5Errors: false
        },
        lastUpdate: latestDex.created_at,
        message: 'DEX data available but not parsed with hybrid parser'
      }), { status: 200, headers: { 'Content-Type': 'application/json' } })
    }

    // Return the hybrid summary data optimized for device cards
    return new Response(JSON.stringify({
      success: true,
      hasData: true,
      summary: hybridData.summary || {},
      keyValueData: hybridData.keyValue || {},
      deviceCardData: deviceCardData || {},
      eventData: deviceCardData?.eventData || {},
      ma5ErrorData: deviceCardData?.ma5ErrorData || {},
      coinData: deviceCardData?.coinData || {},
      topProducts: deviceCardData?.topProducts || [],
      lastUpdate: latestDex.created_at,
      dexId: latestDex.dex_id,
      hasErrors: latestDex.has_errors,
      rawContentLength: latestDex.raw_content?.length || 0
    }), { status: 200, headers: { 'Content-Type': 'application/json' } })

  } catch (error) {
    console.error('Error fetching parsed DEX summary:', error)
    return new Response(JSON.stringify({
      success: false,
      error: error.message || 'Failed to fetch DEX summary'
    }), { status: 500, headers: { 'Content-Type': 'application/json' } })
  }
}
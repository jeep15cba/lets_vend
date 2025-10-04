// API endpoint to get parsed DEX data summary for device cards
export const runtime = 'edge'
import { getUserCompanyContext } from '../../../lib/supabase/server'

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    // Get user context from Supabase auth
    const { user, companyId, error: authError } = await getUserCompanyContext(req)

    if (authError || !user) {
      return res.status(401).json({ error: 'Authentication required' })
    }

    const { case_serial } = req.query

    if (!case_serial) {
      return res.status(400).json({ error: 'case_serial parameter is required' })
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
      return res.status(404).json({
        success: false,
        error: 'Machine not found or access denied'
      })
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
      return res.status(200).json({
        success: true,
        hasData: false,
        message: 'No DEX data available for this machine'
      })
    }

    if (!latestDex) {
      return res.status(200).json({
        success: true,
        hasData: false,
        message: 'No DEX data found'
      })
    }

    // Extract hybrid data for device card display
    const parsedData = latestDex.parsed_data
    const hybridData = parsedData?.hybridData
    const deviceCardData = parsedData?.deviceCardData

    if (!hybridData) {
      return res.status(200).json({
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
      })
    }

    // Return the hybrid summary data optimized for device cards
    return res.status(200).json({
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
    })

  } catch (error) {
    console.error('Error fetching parsed DEX summary:', error)
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch DEX summary'
    })
  }
}
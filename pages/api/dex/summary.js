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
      return res.status(400).json({ error: 'case_serial parameter required' })
    }

    // Set up database connection
    const { createServiceClient } = require('../../../lib/supabase/server')
    const { supabase } = createServiceClient()

    // Get the most recent DEX record for this machine
    const { data: dexRecord, error } = await supabase
      .from('dex_captures')
      .select('parsed_data, created_at, raw_content')
      .eq('case_serial', case_serial)
      .order('created_at', { ascending: false })
      .limit(1)
      .single()

    if (error && error.code !== 'PGRST116') { // PGRST116 = no rows returned
      console.error('Error fetching DEX summary:', error)
      return res.status(500).json({ error: 'Failed to fetch DEX data' })
    }

    if (!dexRecord) {
      return res.status(200).json({
        success: true,
        hasData: false,
        message: 'No DEX data available for this machine'
      })
    }

    const summary = dexRecord.parsed_data?.summary || null
    const structured = dexRecord.parsed_data?.dexStructured || null
    const keyValueGroups = dexRecord.parsed_data?.hybridData?.keyValueGroups || null
    const keyValue = dexRecord.parsed_data?.hybridData?.keyValue || null

    return res.status(200).json({
      success: true,
      hasData: true,
      summary,
      structured,
      keyValueGroups,
      keyValue,
      lastUpdate: dexRecord.created_at,
      rawLength: dexRecord.raw_content?.length || 0
    })

  } catch (error) {
    console.error('Error in DEX summary API:', error)
    return res.status(500).json({ error: 'Internal server error' })
  }
}
import { getUserCompanyContext } from '../../../lib/supabase/server'
export const runtime = 'edge'

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
      return new Response(JSON.stringify({ error: 'case_serial parameter required' }), { status: 400, headers: { 'Content-Type': 'application/json' } })
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
      return new Response(JSON.stringify({ error: 'Failed to fetch DEX data' }), { status: 500, headers: { 'Content-Type': 'application/json' } })
    }

    if (!dexRecord) {
      return new Response(JSON.stringify({
        success: true,
        hasData: false,
        message: 'No DEX data available for this machine'
      }), { status: 200, headers: { 'Content-Type': 'application/json' } })
    }

    const summary = dexRecord.parsed_data?.summary || null
    const structured = dexRecord.parsed_data?.dexStructured || null
    const keyValueGroups = dexRecord.parsed_data?.hybridData?.keyValueGroups || null
    const keyValue = dexRecord.parsed_data?.hybridData?.keyValue || null

    return new Response(JSON.stringify({
      success: true,
      hasData: true,
      summary,
      structured,
      keyValueGroups,
      keyValue,
      lastUpdate: dexRecord.created_at,
      rawLength: dexRecord.raw_content?.length || 0
    }), { status: 200, headers: { 'Content-Type': 'application/json' } })

  } catch (error) {
    console.error('Error in DEX summary API:', error)
    return new Response(JSON.stringify({ error: 'Internal server error' }), { status: 500, headers: { 'Content-Type': 'application/json' } })
  }
}
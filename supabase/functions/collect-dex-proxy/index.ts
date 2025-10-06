// @ts-ignore
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
// @ts-ignore
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

/**
 * Simple proxy to Cloudflare Pages API - avoids Cantaloupe blocking Supabase IPs
 */

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// @ts-ignore
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const siteUrl = Deno.env.get('SITE_URL') || 'https://lets-vend.pages.dev'
    const serviceApiKey = Deno.env.get('SERVICE_API_KEY')!

    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    console.log('🕐 Starting DEX collection via Cloudflare Pages...')

    // Get all companies with DEX credentials
    const { data: credentials, error: credError } = await supabase
      .from('user_credentials')
      .select(`
        company_id,
        companies!inner (
          company_name
        )
      `)
      .not('username_encrypted', 'is', null)

    if (credError) {
      throw new Error(`Failed to fetch credentials: ${credError.message}`)
    }

    console.log(`Found ${credentials?.length || 0} companies`)

    const results = []

    for (const cred of credentials || []) {
      try {
        const companyName = cred.companies?.company_name || 'Unknown'
        const companyId = cred.company_id

        console.log(`\n📦 ${companyName} (${companyId})`)

        // Call Cloudflare Pages API which handles all Cantaloupe communication
        const response = await fetch(`${siteUrl}/api/dex/collect-bulk`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Company-ID': companyId,
            'X-Service-Key': serviceApiKey
          }
        })

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`)
        }

        const result = await response.json()

        results.push({
          company_id: companyId,
          company_name: companyName,
          success: true,
          recordsCollected: result.recordsCount || 0
        })

        console.log(`✅ ${result.recordsCount || 0} records`)

      } catch (error) {
        console.error(`❌ ${cred.company_id}: ${error.message}`)
        results.push({
          company_id: cred.company_id,
          success: false,
          error: error.message
        })
      }

      await new Promise(resolve => setTimeout(resolve, 1000))
    }

    const successCount = results.filter(r => r.success).length
    const totalRecords = results.reduce((sum, r) => sum + (r.recordsCollected || 0), 0)

    console.log(`\n✅ ${successCount}/${results.length} companies, ${totalRecords} records`)

    // Update 4-hour flags
    console.log('\n🕐 Updating 4-hour DEX flags...')
    const now = new Date()
    const fourHoursAgo = new Date(now.getTime() - (4 * 60 * 60 * 1000))

    const { data: allMachines } = await supabase
      .from('machines')
      .select('id, dex_history')

    if (allMachines) {
      const flagUpdates = allMachines.map(machine => ({
        id: machine.id,
        dex_last_4hrs: (machine.dex_history || []).some(entry =>
          new Date(entry.created) > fourHoursAgo
        ) ? 'Yes' : 'No'
      }))

      await supabase.from('machines').upsert(flagUpdates, { onConflict: 'id' })
      console.log(`✅ Updated ${flagUpdates.length} machines`)
    }

    return new Response(
      JSON.stringify({
        success: true,
        companiesProcessed: results.length,
        successfulCollections: successCount,
        totalRecords,
        results
      }),
      {
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      }
    )

  } catch (error) {
    console.error('❌ Error:', error)
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message
      }),
      {
        status: 500,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      }
    )
  }
})

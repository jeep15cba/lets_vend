// @ts-ignore
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
// @ts-ignore
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// @ts-ignore
Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const siteUrl = Deno.env.get('SITE_URL') || Deno.env.get('NEXT_PUBLIC_SITE_URL')
    const serviceApiKey = Deno.env.get('SERVICE_API_KEY')

    if (!siteUrl) {
      throw new Error('SITE_URL environment variable not set')
    }

    if (!serviceApiKey) {
      throw new Error('SERVICE_API_KEY environment variable not set')
    }

    // Create Supabase client with service role (bypasses RLS)
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    console.log('🕐 Cron: Starting DEX collection for all companies...')

    // Get all companies with DEX credentials
    const { data: credentials, error: credError } = await supabase
      .from('user_credentials')
      .select(`
        company_id,
        username_encrypted,
        site_url,
        companies!inner (
          company_name
        )
      `)
      .not('username_encrypted', 'is', null)

    if (credError) {
      throw new Error(`Failed to fetch credentials: ${credError.message}`)
    }

    console.log(`Found ${credentials?.length || 0} companies with DEX credentials`)

    const results = []

    // Process each company
    for (const cred of credentials || []) {
      try {
        const companyName = cred.companies?.company_name || 'Unknown'

        console.log(`Collecting DEX data for company: ${companyName} (${cred.company_id})`)

        let totalRecordsCollected = 0
        let offset = 0
        let hasMore = true
        const batchLimit = 15
        const companyErrors = []

        // Batch processing loop - continue until all records are processed
        while (hasMore) {
          console.log(`📦 Fetching batch for ${companyName}: offset=${offset}, limit=${batchLimit}`)

          // Call the bulk collection endpoint with service authentication and batching params
          const response = await fetch(`${siteUrl}/api/dex/collect-bulk?limit=${batchLimit}&offset=${offset}`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-Company-ID': cred.company_id,
              'X-Service-Key': serviceApiKey
            }
          })

          if (!response.ok) {
            const errorText = await response.text()
            throw new Error(`HTTP ${response.status}: ${errorText}`)
          }

          const result = await response.json()

          // Accumulate results
          totalRecordsCollected += result.recordsCount || 0
          if (result.errors && result.errors.length > 0) {
            companyErrors.push(...result.errors)
          }

          console.log(`✅ Batch complete: ${result.recordsCount || 0} records, hasMore=${result.batching?.hasMore || false}`)

          // Check if there are more records to process
          hasMore = result.batching?.hasMore || false
          if (hasMore) {
            offset = result.batching.nextOffset
            // Small delay between batches to avoid rate limiting
            await new Promise(resolve => setTimeout(resolve, 500))
          }
        }

        results.push({
          company_id: cred.company_id,
          company_name: companyName,
          success: true,
          recordsCollected: totalRecordsCollected,
          errors: companyErrors.length > 0 ? companyErrors : []
        })

        console.log(`✅ ${companyName}: ${totalRecordsCollected} total records collected`)

      } catch (error) {
        console.error(`❌ Error collecting for company ${cred.company_id}:`, error)
        results.push({
          company_id: cred.company_id,
          company_name: cred.companies?.company_name || 'Unknown',
          success: false,
          error: error.message
        })
      }

      // Small delay between companies to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 1000))
    }

    const successCount = results.filter(r => r.success).length
    const totalRecords = results.reduce((sum, r) => sum + (r.recordsCollected || 0), 0)

    console.log(`✅ Cron completed: ${successCount}/${results.length} companies processed, ${totalRecords} records collected`)

    // Update 4-hour DEX flags after collection
    try {
      console.log('🕐 Updating 4-hour DEX flags...')
      const flagsResponse = await fetch(`${siteUrl}/api/dex/update-4hr-flags`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Service-Key': serviceApiKey
        }
      })

      if (flagsResponse.ok) {
        const flagsResult = await flagsResponse.json()
        console.log(`✅ Updated 4-hour flags: ${flagsResult.hasRecentDex} active, ${flagsResult.noRecentDex} inactive`)
      } else {
        console.log(`⚠️ Failed to update 4-hour flags: ${flagsResponse.status}`)
      }
    } catch (error) {
      console.error('⚠️ Error updating 4-hour flags:', error.message)
      // Don't fail the whole job if flag update fails
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
    console.error('❌ Cron error:', error)
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message,
        stack: error.stack
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

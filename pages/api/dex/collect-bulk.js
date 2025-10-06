/**
 * LEGACY DEX Collection API
 *
 * ⚠️ This endpoint is now superseded by the Supabase Edge Function for automated collection.
 *
 * For scheduled/automated DEX collection, use:
 *   - Supabase Edge Function: supabase/functions/collect-dex-standalone/
 *   - Documentation: supabase/functions/collect-dex-standalone/README.md
 *   - Recommended: Run via pg_cron every 15-30 minutes
 *
 * This endpoint remains available for:
 *   - Manual/on-demand DEX collection
 *   - Large batch processing (500+ records)
 *   - Historical data backfill
 *   - Testing and debugging
 *
 * Key differences:
 *   - Edge Function: Optimized for scheduled runs, faster, lower cost
 *   - This endpoint: Full batch processing, Cloudflare Pages runtime
 */

import { getUserCompanyContext, createClient } from '../../../lib/supabase/server'
import { createServiceClient, validateServiceAuth } from '../../../lib/supabase/service'
export const runtime = 'edge'
import { parseDexContent, formatDexSummary } from '../../../lib/dex-parser'
import { parseDexToKeyValue, formatKeyValuePairs } from '../../../lib/dex-key-value-parser'
import { parseHybridDex, getDeviceCardData } from '../../../lib/dex-hybrid-parser'
import { getUserDexCredentials, getDexCredentialsByCompanyId } from '../../../lib/user-credentials'

export default async function handler(req) {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: { 'Content-Type': 'application/json' } })
  }

  try {
    // Parse batching parameters from query string
    const url = new URL(req.url)
    const batchLimit = parseInt(url.searchParams.get('limit') || '15', 10)
    const batchOffset = parseInt(url.searchParams.get('offset') || '0', 10)

    console.log(`📦 Batch processing: limit=${batchLimit}, offset=${batchOffset}`)

    let companyId
    let supabase
    let isServiceAuth = false

    // Check for service-level authentication first
    const serviceKey = req.headers.get('X-Service-Key')
    const companyIdHeader = req.headers.get('X-Company-ID')

    // Debug logging
    console.log('📋 Headers received:', {
      serviceKey: serviceKey ? 'present' : 'missing',
      companyId: companyIdHeader ? 'present' : 'missing',
      allHeaders: Object.fromEntries(req.headers.entries())
    })

    if (serviceKey) {
      console.log('🔐 Service-level authentication detected')

      const serviceAuth = validateServiceAuth(req)

      if (!serviceAuth.valid) {
        return new Response(JSON.stringify({ error: serviceAuth.error }), {
          status: 401,
          headers: { 'Content-Type': 'application/json' }
        })
      }

      companyId = serviceAuth.companyId
      supabase = createServiceClient()
      isServiceAuth = true
      console.log(`✅ Service auth validated for company: ${companyId}`)
    } else {
      // Regular user authentication
      console.log('🔐 User authentication detected')

      const { user, companyId: userCompanyId, error: authError } = await getUserCompanyContext(req)

      if (authError || !user) {
        return new Response(JSON.stringify({ error: 'Authentication required' }), {
          status: 401,
          headers: { 'Content-Type': 'application/json' }
        })
      }

      companyId = userCompanyId
      const clientResult = createClient(req)
      supabase = clientResult.supabase
      console.log(`✅ User auth validated for company: ${companyId}`)
    }

    console.log(`🔧 Starting bulk DEX data collection...`)

    // Step 1: Authenticate with Cantaloupe
    console.log('Authenticating with DEX platform...')
    const baseUrl = req.headers.get('origin') || process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_LOCAL_URL || 'http://localhost:3000'
    const cookieHeader = req.headers.get('cookie') || ''
    console.log('Forwarding Supabase auth cookies to /api/cantaloupe/auth:', cookieHeader ? 'Present' : 'Missing')

    const authResponse = await fetch(`${baseUrl}/api/cantaloupe/auth`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': cookieHeader
      }
    })

    const authData = await authResponse.json()
    if (!authData.success) {
      throw new Error('Authentication failed with Cantaloupe')
    }

    const allCookies = authData.cookies
    console.log('Authentication successful!')

    // Get siteUrl from credentials (service or user based on auth type)
    const credentials = isServiceAuth
      ? await getDexCredentialsByCompanyId(companyId)
      : await getUserDexCredentials(req)

    const siteUrl = credentials.siteUrl || 'https://dashboard.cantaloupe.online'

    if (!credentials.isConfigured) {
      return new Response(JSON.stringify({
        error: credentials.error || 'No DEX credentials configured',
        success: false
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      })
    }

    // Step 2: Extract CSRF token
    let csrfToken = null
    try {
      const dashResponse = await fetch(siteUrl, {
        method: 'GET',
        headers: {
          'Cookie': allCookies,
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36'
        }
      })

      const dashHtml = await dashResponse.text()
      const patterns = [
        /<meta\s+name="csrf-token"\s+content="([^"]+)"/i,
        /csrf[_-]?token['"]\s*:\s*['"']([^'"]+)['"]/i,
        /_token['"]\s*:\s*['"']([^'"]+)['"]/
      ]

      for (const pattern of patterns) {
        const match = dashHtml.match(pattern)
        if (match) {
          csrfToken = match[1]
          break
        }
      }
    } catch (e) {
      console.error('Error fetching CSRF token:', e)
    }

    console.log('CSRF token extracted:', !!csrfToken)

    // Step 3: Fetch ALL DEX data without machine filtering
    const formData = new URLSearchParams()

    // Basic DataTables parameters
    formData.append('draw', '1')
    formData.append('start', '0')
    formData.append('length', '100') // Get more records per page

    // Column definitions
    const columns = [
      { data: '', name: '', searchable: 'false', orderable: 'false' },
      { data: '', name: '', searchable: 'false', orderable: 'false' },
      { data: 'dexRaw.created', name: '', searchable: 'true', orderable: 'true' },
      { data: 'dexRaw.parsed', name: '', searchable: 'true', orderable: 'false' },
      { data: 'dexRaw.uploadReason', name: '', searchable: 'true', orderable: 'false' },
      { data: 'dexRaw.dexSource', name: '', searchable: 'true', orderable: 'false' },
      { data: 'dexRaw.firmware', name: '', searchable: 'true', orderable: 'false' },
      { data: 'devices.caseSerial', name: '', searchable: 'true', orderable: 'false' },
      { data: 'customers.name', name: '', searchable: 'true', orderable: 'false' },
      { data: 'vdiToDEX', name: '', searchable: 'true', orderable: 'false' }
    ]

    columns.forEach((col, index) => {
      formData.append(`columns[${index}][data]`, col.data)
      formData.append(`columns[${index}][name]`, col.name)
      formData.append(`columns[${index}][searchable]`, col.searchable)
      formData.append(`columns[${index}][orderable]`, col.orderable)
      formData.append(`columns[${index}][search][value]`, '')
      formData.append(`columns[${index}][search][regex]`, 'false')
    })

    // Order by most recent
    formData.append('order[0][column]', '2')
    formData.append('order[0][dir]', 'desc')

    // Root-level search parameters
    formData.append('search[value]', '')
    formData.append('search[regex]', 'false')

    // Date range for today
    const now = new Date()
    const timezoneOffset = now.getTimezoneOffset()
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0)
    const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59)

    const formatWithTimezone = (date) => {
      const offsetHours = Math.floor(Math.abs(timezoneOffset) / 60)
      const offsetMinutes = Math.abs(timezoneOffset) % 60
      const sign = timezoneOffset <= 0 ? '+' : '-'
      const offsetString = `${sign}${offsetHours.toString().padStart(2, '0')}:${offsetMinutes.toString().padStart(2, '0')}`

      const year = date.getFullYear()
      const month = (date.getMonth() + 1).toString().padStart(2, '0')
      const day = date.getDate().toString().padStart(2, '0')
      const hours = date.getHours().toString().padStart(2, '0')
      const minutes = date.getMinutes().toString().padStart(2, '0')
      const seconds = date.getSeconds().toString().padStart(2, '0')

      return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}${offsetString}`
    }

    formData.append('startDateVal', formatWithTimezone(startOfDay))
    formData.append('endDateVal', formatWithTimezone(endOfDay))
    formData.append('offset', Math.abs(timezoneOffset).toString())

    console.log('Fetching bulk DEX data...')

    // Fetch ALL DEX data
    const dexResponse = await fetch(`${siteUrl}/dex`, {
      method: 'POST',
      headers: {
        'Cookie': allCookies,
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36',
        'Accept': 'application/json, text/javascript, */*; q=0.01',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'gzip, deflate, br, zstd',
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache',
        'X-CSRF-TOKEN': csrfToken || '',
        'X-Requested-With': 'XMLHttpRequest',
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        'Origin': siteUrl,
        'Referer': `${siteUrl}/dex`,
        'Sec-CH-UA': '"Chromium";v="140", "Not=A?Brand";v="24", "Google Chrome";v="140"',
        'Sec-CH-UA-Mobile': '?0',
        'Sec-CH-UA-Platform': '"macOS"',
        'Sec-Fetch-Dest': 'empty',
        'Sec-Fetch-Mode': 'cors',
        'Sec-Fetch-Site': 'same-origin'
      },
      body: formData.toString()
    })

    if (!dexResponse.ok) {
      console.log(`DEX endpoint returned ${dexResponse.status} - no bulk DEX data available`)
      return new Response(JSON.stringify({
        success: true,
        recordsCount: 0,
        message: 'No bulk DEX data available'
      }), { status: 200, headers: { 'Content-Type': 'application/json' } })
    }

    const dexData = await dexResponse.json()
    console.log('Bulk DEX data received:', {
      recordsTotal: dexData.recordsTotal,
      recordsFiltered: dexData.recordsFiltered,
      dataLength: dexData.data?.length
    })

    if (!dexData.data || !Array.isArray(dexData.data)) {
      console.log('No DEX data available in bulk response')
      return new Response(JSON.stringify({
        success: true,
        message: 'No new DEX data available',
        recordsCount: 0
      }), { status: 200, headers: { 'Content-Type': 'application/json' } })
    }

    // Step 4: Supabase client already set up based on auth type (see above)

    // Get all machines for this company
    const { data: machines, error: machinesError } = await supabase
      .from('machines')
      .select('id, case_serial, company_id')
      .eq('company_id', companyId)

    if (machinesError || !machines) {
      throw new Error('Failed to fetch machines from database')
    }

    // Create a lookup map for machines
    const machineMap = {}
    machines.forEach(machine => {
      machineMap[machine.case_serial] = machine
    })

    // Get existing DEX IDs to avoid duplicates (filtered by company)
    const { data: existingDexRecords } = await supabase
      .from('dex_captures')
      .select('dex_id')
      .eq('company_id', companyId)

    const existingDexIds = new Set()
    if (existingDexRecords) {
      existingDexRecords.forEach(record => {
        existingDexIds.add(record.dex_id)
      })
    }

    console.log(`Found ${existingDexIds.size} existing DEX records in database`)

    // Step 5: Identify new DEX records that need to be fetched
    const newDexRecords = []
    let totalInMetadata = 0

    for (const dexRecord of dexData.data) {
      totalInMetadata++

      // Extract machine identifier and DEX ID
      const caseSerial = dexRecord.devices?.caseSerial || dexRecord.case_serial
      const rowId = dexRecord.DT_RowId || dexRecord.id
      const actualDexId = dexRecord.dexRaw?.id // This is the real ID for /dex/getRawDex/{dexId}

      // Debug: Check what values we're actually getting
      if (dexRecord.devices?.caseSerial === 'CSA200202679') { // Sample one for debugging
        console.log('🔍 DEBUG DEX ID mapping:', {
          rowId,
          actualDexId,
          'dexRecord.dexRaw?.id': dexRecord.dexRaw?.id,
          'dexRecord.DT_RowId': dexRecord.DT_RowId,
          'Full dexRaw object': dexRecord.dexRaw
        })
      }

      if (!rowId || !actualDexId || !caseSerial || !machineMap[caseSerial]) {
        continue // Skip invalid records or machines not in our company
      }

      // Only process if this DEX ID is new (using actualDexId for uniqueness check)
      if (!existingDexIds.has(String(actualDexId))) {
        newDexRecords.push({
          dexId: String(actualDexId), // Use the actual dexRaw.id for API calls
          rowId: String(rowId), // Keep rowId for database uniqueness
          caseSerial,
          machine: machineMap[caseSerial],
          metadata: dexRecord
        })
      }
    }

    console.log(`Found ${newDexRecords.length} new DEX records out of ${totalInMetadata} total metadata records`)

    if (newDexRecords.length === 0) {
      return new Response(JSON.stringify({
        success: true,
        recordsCount: 0,
        message: 'No new DEX records to fetch',
        hasMore: false,
        totalAvailable: 0
      }), { status: 200, headers: { 'Content-Type': 'application/json' } })
    }

    // Apply batching: slice the newDexRecords array
    const totalAvailable = newDexRecords.length
    const batchedRecords = newDexRecords.slice(batchOffset, batchOffset + batchLimit)
    const hasMore = (batchOffset + batchLimit) < totalAvailable
    const nextOffset = hasMore ? batchOffset + batchLimit : null

    console.log(`📦 Batch processing: ${batchedRecords.length} records (${batchOffset + 1}-${batchOffset + batchedRecords.length} of ${totalAvailable})`)
    if (hasMore) {
      console.log(`📦 More records available: nextOffset=${nextOffset}`)
    }

    // Step 6: Fetch raw DEX data for each new record using /dex/getRawDex/{dexId}
    console.log(`Fetching raw DEX data for ${batchedRecords.length} batched records...`)

    const processedRecords = [] // Lightweight records for database
    const completeRecords = [] // Complete records for file storage
    const fetchErrors = []

    for (const newRecord of batchedRecords) {
      try {
        console.log(`Fetching raw DEX data for actualDexId: ${newRecord.dexId} (rowId: ${newRecord.rowId}) for machine: ${newRecord.caseSerial}`)

        // Try POST method with form data like the working /dex endpoint
        const getRawDexFormData = new URLSearchParams()
        getRawDexFormData.append('dexId', newRecord.dexId)

        const rawDexResponse = await fetch(`${siteUrl}/dex/getRawDex/${newRecord.dexId}`, {
          method: 'POST',
          headers: {
            'Accept': 'text/plain, */*',
            // Removed 'Accept-Encoding' to get uncompressed response
            'Accept-Language': 'en-US,en;q=0.9',
            'Cache-Control': 'no-cache',
            'Content-Length': getRawDexFormData.toString().length.toString(),
            'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
            'Cookie': allCookies,
            'Origin': siteUrl,
            'Pragma': 'no-cache',
            'Priority': 'u=1, i',
            'Referer': `${siteUrl}/dex`,
            'Sec-CH-UA': '"Chromium";v="140", "Not=A?Brand";v="24", "Google Chrome";v="140"',
            'Sec-CH-UA-Mobile': '?0',
            'Sec-CH-UA-Platform': '"macOS"',
            'Sec-Fetch-Dest': 'empty',
            'Sec-Fetch-Mode': 'cors',
            'Sec-Fetch-Site': 'same-origin',
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36',
            'X-CSRF-TOKEN': csrfToken || '',
            'X-Requested-With': 'XMLHttpRequest'
          },
          body: getRawDexFormData.toString()
        })

        if (!rawDexResponse.ok) {
          console.log(`Failed to fetch raw DEX data for dexId ${newRecord.dexId}: ${rawDexResponse.status}`)
          fetchErrors.push({
            dexId: newRecord.dexId,
            error: `HTTP ${rawDexResponse.status}`
          })
          continue
        }

        // The API returns raw DEX data (text format), not JSON
        const rawDexText = await rawDexResponse.text()

        console.log(`✅ Successfully fetched raw DEX data for dexId ${newRecord.dexId}: ${rawDexText.length} characters`)

        // Parse the raw DEX content into structured data using legacy parsers
        const parsedDexData = parseDexContent(rawDexText)
        const dexSummary = formatDexSummary(parsedDexData)

        // Parse into key-value pairs using legacy parser
        const keyValuePairs = parseDexToKeyValue(rawDexText)
        const formattedKeyValues = formatKeyValuePairs(keyValuePairs)

        // Parse using new hybrid parser with event codes and MA5 errors
        const hybridData = parseHybridDex(rawDexText)
        const deviceCardData = getDeviceCardData(hybridData)

        // Create optimized record for database storage (lightweight)
        const optimizedKeyValueGroups = { ...formattedKeyValues }
        // Remove products to reduce database storage size
        delete optimizedKeyValueGroups.products

        const databaseRecord = {
          dex_id: newRecord.dexId, // Use actual dexRaw.id
          machine_id: newRecord.machine.id,
          case_serial: newRecord.machine.case_serial,
          company_id: companyId, // Add company_id for RLS
          raw_content: rawDexText, // Store the actual raw DEX content (matches current schema)
          parsed_data: {
            // Lightweight data for database - only essential key-value groups without products
            keyValueGroups: optimizedKeyValueGroups,
            // Include hybrid summary data for device cards with full keyValueGroups
            hybridData: {
              summary: hybridData.summary,
              keyValue: hybridData.keyValue,
              keyValueGroups: formattedKeyValues // Include full keyValueGroups with sales data
            },
            // Include device card ready data
            deviceCardData: deviceCardData,
            // Basic metadata
            actualDexId: newRecord.dexId,
            rawLength: rawDexText.length,
            startsWithDXS: rawDexText.startsWith('DXS*')
          },
          has_errors: false, // No errors if we successfully got the data
          record_count: rawDexText.split('\n').length, // Count lines in DEX data
          created_at: newRecord.metadata.dexRaw.created // Use actual DEX creation time from metadata
        }

        // Create complete record for file storage (full data)
        const completeRecord = {
          dex_id: newRecord.dexId,
          machine_id: newRecord.machine.id,
          case_serial: newRecord.machine.case_serial,
          company_id: companyId,
          raw_content: rawDexText,
          parsed_data: {
            metadata: newRecord.metadata,
            actualDexId: newRecord.dexId,
            rawLength: rawDexText.length,
            startsWithDXS: rawDexText.startsWith('DXS*'),
            // Include parsed DEX structure (legacy)
            dexStructured: parsedDexData,
            // Include formatted summary for easy access (legacy)
            summary: dexSummary,
            // Include detailed key-value pairs (legacy)
            keyValuePairs: keyValuePairs,
            // Include formatted grouped key-values (legacy) - WITH products
            keyValueGroups: formattedKeyValues,
            // Include new hybrid parser data with event codes and MA5 errors
            hybridData: hybridData,
            // Include device card ready data
            deviceCardData: deviceCardData
          },
          has_errors: false,
          record_count: rawDexText.split('\n').length,
          created_at: newRecord.metadata.dexRaw.created // Use actual DEX creation time from metadata
        }

        processedRecords.push(databaseRecord) // For database storage
        completeRecords.push(completeRecord) // For file storage

      } catch (error) {
        console.error(`Error fetching raw DEX data for dexId ${newRecord.dexId}:`, error)
        fetchErrors.push({
          dexId: newRecord.dexId,
          error: error.message
        })
      }
    }

    console.log(`Successfully fetched ${processedRecords.length} raw DEX records, ${fetchErrors.length} errors`)

    // Note: File saving removed for Edge Runtime compatibility
    // Data is saved to Supabase database instead
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
    const filename = `dex-bulk-collection-${timestamp}.json`
    console.log(`📁 DEX collection completed (would save to: ${filename})`)
    console.log(`📊 Stats: ${completeRecords.length} processed, ${fetchErrors.length} errors`)

    // Step 7.5: Update machines with DEX metadata even if raw data fetch failed
    // This ensures machines get updated with latest DEX timestamps and info from metadata
    // IMPORTANT: Only process machines from the current BATCH to avoid subrequest limit
    const machineMetadataUpdates = {}

    for (const newRecord of batchedRecords) {
      const caseSerial = newRecord.caseSerial
      const machine = newRecord.machine
      const dexMetadata = newRecord.metadata.dexRaw

      if (!machineMetadataUpdates[caseSerial]) {
        machineMetadataUpdates[caseSerial] = {
          machine,
          latestCreated: dexMetadata.created,
          latestDexId: newRecord.dexId,
          count: 0,
          hasErrors: false
        }
      }

      machineMetadataUpdates[caseSerial].count++

      // Track the latest DEX record timestamp for this machine
      if (dexMetadata.created > machineMetadataUpdates[caseSerial].latestCreated) {
        machineMetadataUpdates[caseSerial].latestCreated = dexMetadata.created
        machineMetadataUpdates[caseSerial].latestDexId = newRecord.dexId
      }
    }

    // Update machines with metadata info regardless of raw data fetch success
    if (Object.keys(machineMetadataUpdates).length > 0) {
      try {
        // First, fetch current dex_history for these machines
        const machineIds = Object.values(machineMetadataUpdates).map(stats => stats.machine.id)
        const { data: currentMachines } = await supabase
          .from('machines')
          .select('id, dex_history')
          .in('id', machineIds)

        const currentMachineMap = {}
        currentMachines?.forEach(machine => {
          currentMachineMap[machine.id] = machine
        })

        const metadataUpdates = Object.values(machineMetadataUpdates).map(stats => {
          const currentMachine = currentMachineMap[stats.machine.id]
          const currentDexHistory = currentMachine?.dex_history || []

          // Add new DEX entry to history
          const newDexEntry = {
            dexId: stats.latestDexId,
            created: stats.latestCreated
          }

          // Combine with existing history and ensure uniqueness
          const existingDexIds = new Set(currentDexHistory.map(entry => entry.dexId))
          const updatedDexHistory = existingDexIds.has(newDexEntry.dexId)
            ? currentDexHistory
            : [...currentDexHistory, newDexEntry]

          // Sort by created date (newest first) and limit to last 100 entries
          updatedDexHistory.sort((a, b) => new Date(b.created) - new Date(a.created))
          const limitedDexHistory = updatedDexHistory.slice(0, 100)

          return {
            id: stats.machine.id,
            latest_dex_data: new Date(stats.latestCreated).toISOString(), // Use actual DEX creation time
            dex_last_4hrs: stats.count,
            dex_last_capture: new Date(stats.latestCreated).toISOString(),
            dex_history: limitedDexHistory,
            updated_at: new Date().toISOString()
          }
        })

        // Update each machine individually to avoid null constraint errors
        let successCount = 0
        for (const update of metadataUpdates) {
          const { error: metadataUpdateError } = await supabase
            .from('machines')
            .update({
              latest_dex_data: update.latest_dex_data,
              dex_last_4hrs: update.dex_last_4hrs,
              dex_last_capture: update.dex_last_capture,
              dex_history: update.dex_history,
              updated_at: update.updated_at
            })
            .eq('id', update.id)

          if (metadataUpdateError) {
            console.error(`Error updating machine ${update.id} DEX metadata:`, metadataUpdateError)
          } else {
            successCount++
          }
        }

        if (successCount > 0) {
          console.log(`✅ Updated DEX metadata for ${successCount}/${metadataUpdates.length} machines`)
        }
      } catch (error) {
        console.error('Error updating machine metadata:', error)
      }
    }

    // If no records were successfully processed, return early after saving file and updating metadata
    if (processedRecords.length === 0) {
      return new Response(JSON.stringify({
        success: true,
        recordsCount: 0,
        machinesUpdated: Object.keys(machineMetadataUpdates).length,
        message: 'No raw DEX data could be fetched, but machine metadata updated',
        errors: fetchErrors
      }), { status: 200, headers: { 'Content-Type': 'application/json' } })
    }

    // Step 8: Update machine statistics (calculate stats regardless of database save success)
    const machineStats = {}
    processedRecords.forEach(record => {
      const caseSerial = record.case_serial
      if (!machineStats[caseSerial]) {
        machineStats[caseSerial] = {
          machine: machineMap[caseSerial],
          count: 0,
          hasErrors: false,
          latestTime: 0
        }
      }
      machineStats[caseSerial].count++
      if (record.has_errors) machineStats[caseSerial].hasErrors = true
      const recordTime = new Date(record.created_at).getTime()
      if (recordTime > machineStats[caseSerial].latestTime) {
        machineStats[caseSerial].latestTime = recordTime
      }
    })

    // Step 9: Save all processed DEX records to Supabase
    try {
      const { data: savedRecords, error: saveError } = await supabase
        .from('dex_captures')
        .upsert(processedRecords, {
          onConflict: 'dex_id,company_id'
        })
        .select()

      if (saveError) {
        console.error('Error saving DEX records:', saveError)
        throw saveError
      }

      console.log(`Saved ${savedRecords?.length || processedRecords.length} DEX records to database`)

      // Step 9.5: Clean up old DEX captures - keep only the most recent 10 per machine
      console.log('Cleaning up old DEX captures...')
      const uniqueCaseSerials = [...new Set(processedRecords.map(r => r.case_serial))]

      for (const caseSerial of uniqueCaseSerials) {
        // Get all DEX captures for this machine, ordered by created_at DESC
        const { data: allCaptures } = await supabase
          .from('dex_captures')
          .select('id, created_at')
          .eq('case_serial', caseSerial)
          .eq('company_id', companyId)
          .order('created_at', { ascending: false })

        if (allCaptures && allCaptures.length > 10) {
          // Keep the first 10 (most recent), delete the rest
          const idsToDelete = allCaptures.slice(10).map(c => c.id)

          const { error: deleteError } = await supabase
            .from('dex_captures')
            .delete()
            .in('id', idsToDelete)

          if (deleteError) {
            console.error(`Error cleaning up old captures for ${caseSerial}:`, deleteError)
          } else {
            console.log(`Cleaned up ${idsToDelete.length} old DEX captures for ${caseSerial}`)
          }
        }
      }

      // Step 10: Prepare DEX history updates for machines
      console.log('Building DEX history updates for machines...')

      // Get current dex_history and latest_errors for machines that need updating
      const machineIds = Object.values(machineStats).map(stats => stats.machine.id)
      const { data: currentMachines, error: fetchError } = await supabase
        .from('machines')
        .select('id, case_serial, dex_history, latest_errors')
        .in('id', machineIds)

      if (fetchError) {
        console.error('Error fetching current machine data:', fetchError)
        throw fetchError
      }

      // Create lookup for current machine data
      const currentMachineMap = {}
      currentMachines.forEach(machine => {
        currentMachineMap[machine.id] = machine
      })

      // Step 11: Update machine statistics and DEX history in database
      const machineUpdates = await Promise.all(Object.values(machineStats).map(async (stats) => {
        const currentMachine = currentMachineMap[stats.machine.id]
        const currentDexHistory = currentMachine?.dex_history || []
        const currentLatestErrors = currentMachine?.latest_errors || [] // Use fresh data from database

        // Get new DEX records for this machine
        const machineNewRecords = processedRecords.filter(record =>
          record.case_serial === stats.machine.case_serial
        )

        // Build new DEX history entries
        const newDexEntries = machineNewRecords.map(record => ({
          dexId: record.dex_id,
          created: record.created_at
        }))

        // Combine with existing history and ensure uniqueness
        const existingDexIds = new Set(currentDexHistory.map(entry => entry.dexId))
        const uniqueNewEntries = newDexEntries.filter(entry => !existingDexIds.has(entry.dexId))
        const updatedDexHistory = [...currentDexHistory, ...uniqueNewEntries]

        // Sort by created date (newest first) and limit to last 100 entries
        updatedDexHistory.sort((a, b) => new Date(b.created) - new Date(a.created))
        const limitedDexHistory = updatedDexHistory.slice(0, 100)

        console.log(`Machine ${stats.machine.case_serial}: Adding ${uniqueNewEntries.length} new DEX entries (total: ${limitedDexHistory.length})`)

        // Get the most recent DEX creation time from the history
        const latestDexCreated = limitedDexHistory.length > 0 ? limitedDexHistory[0].created : null

        // Get the latest DEX parsed_data for this machine
        let latestParsedData = stats.machine.latest_dex_parsed // Keep existing if no updates

        if (machineNewRecords.length > 0) {
          // If we have new records, use the most recent one
          const latestDexRecord = machineNewRecords.reduce((latest, record) =>
            new Date(record.created_at) > new Date(latest.created_at) ? record : latest
          )
          latestParsedData = latestDexRecord.parsed_data
        } else if (!latestParsedData && limitedDexHistory.length > 0) {
          // No new records and no existing parsed data - fetch from dex_captures
          const latestDexId = limitedDexHistory[0].dexId
          const { data: existingCapture } = await supabase
            .from('dex_captures')
            .select('parsed_data')
            .eq('dex_id', latestDexId)
            .single()

          if (existingCapture) {
            latestParsedData = existingCapture.parsed_data
          }
        }

        // Extract EA1 and MA5 errors from latest parsed data
        const existingErrors = currentLatestErrors // Use fresh data from database, not stale data from initial fetch
        const newErrors = []

        // Extract EA1 errors (persistent with timestamp)
        if (latestParsedData?.hybridData?.keyValueGroups?.events) {
          const events = latestParsedData.hybridData.keyValueGroups.events
          const ea1Keys = Object.keys(events).filter(key => key.match(/^ea1_event_\w+_date$/))

          for (const dateKey of ea1Keys) {
            const code = dateKey.replace('ea1_event_', '').replace('_date', '')
            const timeKey = `ea1_event_${code}_time`
            const date = events[dateKey] // Format: YYMMDD (e.g., "250930")
            const time = events[timeKey] // Format: HHMM (e.g., "1237")

            if (date && time) {
              // Convert YYMMDD and HHMM to ISO timestamp (LOCAL TIME - no Z suffix)
              // EA1 timestamps are in local machine time, not UTC
              const year = '20' + date.substring(0, 2)
              const month = date.substring(2, 4)
              const day = date.substring(4, 6)
              const hour = time.substring(0, 2).padStart(2, '0')
              const minute = time.substring(2, 4).padStart(2, '0')
              const timestamp = `${year}-${month}-${day}T${hour}:${minute}:00`

              newErrors.push({
                type: 'EA1',
                code: code.toUpperCase(),
                date,
                time,
                timestamp,
                actioned: false,
                actioned_at: null
              })
            }
          }
        }

        // Extract MA5 errors (transient - appear/disappear)
        if (latestParsedData?.hybridData?.keyValueGroups?.diagnostics?.ma5_error_codes) {
          const ma5Codes = latestParsedData.hybridData.keyValueGroups.diagnostics.ma5_error_codes.split(',')
          const captureTimestamp = latestParsedData?.created_at || new Date().toISOString()

          ma5Codes.forEach(code => {
            if (code) {
              newErrors.push({
                type: 'MA5',
                code: code.toUpperCase(),
                timestamp: captureTimestamp,
                actioned: false,
                actioned_at: null
              })
            }
          })
        }

        // Merge new errors with existing errors, preserving actioned status
        const mergedErrors = []

        // Helper to normalize timestamps (remove Z suffix for comparison)
        const normalizeTimestamp = (ts) => ts ? ts.replace('Z', '') : ts

        // Process new errors from this DEX capture
        newErrors.forEach(newError => {
          // Check if this exact error already exists (same code AND timestamp)
          const existingError = existingErrors.find(e => {
            if (newError.type === 'EA1') {
              // For EA1: match by code AND timestamp (normalize for comparison)
              return e.type === 'EA1' &&
                     e.code === newError.code &&
                     normalizeTimestamp(e.timestamp) === normalizeTimestamp(newError.timestamp)
            } else {
              // For MA5: match by code only (transient errors)
              return e.type === 'MA5' && e.code === newError.code
            }
          })

          if (existingError) {
            // Exact same error - preserve actioned status
            mergedErrors.push({
              ...newError,
              actioned: existingError.actioned,
              actioned_at: existingError.actioned_at
            })
          } else {
            // New error or different timestamp - add with actioned: false
            mergedErrors.push(newError)
          }
        })

        // For EA1 errors: Keep old actioned errors ONLY if there's no newer error with the same code
        existingErrors.forEach(oldError => {
          if (oldError.type === 'EA1' && oldError.actioned) {
            // Check if this exact error (code + timestamp) is NOT in the new errors
            const exactMatch = newErrors.find(e =>
              e.type === 'EA1' &&
              e.code === oldError.code &&
              normalizeTimestamp(e.timestamp) === normalizeTimestamp(oldError.timestamp)
            )

            // Check if there's ANY newer error with the same code (different timestamp)
            const newerErrorWithSameCode = newErrors.find(e => {
              if (e.type !== 'EA1' || e.code !== oldError.code) return false
              // Different timestamp means newer error
              return normalizeTimestamp(e.timestamp) !== normalizeTimestamp(oldError.timestamp)
            })

            // Only keep old actioned error if:
            // 1. It's not an exact match (already handled above)
            // 2. There's no newer error with the same code (different timestamp)
            if (!exactMatch && !newerErrorWithSameCode) {
              mergedErrors.push(oldError)
            }
          }
        })

        const latestErrors = mergedErrors

        return {
          id: stats.machine.id,
          latest_dex_data: latestDexCreated, // Use actual DEX creation time from history
          latest_dex_parsed: latestParsedData, // Store latest parsed_data
          latest_errors: latestErrors, // Store EA1 errors with action status
          dex_last_4hrs: stats.count,
          dex_has_errors: stats.hasErrors,
          dex_last_capture: stats.latestTime ? new Date(stats.latestTime).toISOString() : null,
          dex_history: limitedDexHistory,
          updated_at: new Date().toISOString()
        }
      }))

      if (machineUpdates.length > 0) {
        // Update each machine individually to avoid null constraint errors
        let successCount = 0
        for (const update of machineUpdates) {
          const { error: updateError } = await supabase
            .from('machines')
            .update({
              latest_dex_data: update.latest_dex_data,
              latest_dex_parsed: update.latest_dex_parsed,
              latest_errors: update.latest_errors,
              dex_last_4hrs: update.dex_last_4hrs,
              dex_has_errors: update.dex_has_errors,
              dex_last_capture: update.dex_last_capture,
              dex_history: update.dex_history,
              updated_at: update.updated_at
            })
            .eq('id', update.id)

          if (updateError) {
            console.error(`Error updating machine ${update.id} DEX statistics:`, updateError)
          } else {
            successCount++
          }
        }

        if (successCount > 0) {
          console.log(`✅ Updated DEX statistics for ${successCount}/${machineUpdates.length} machines`)
        }
      }

    } catch (error) {
      console.error('Error saving DEX data:', error)
      // Continue with response even if save fails
    }

    return new Response(JSON.stringify({
      success: true,
      recordsCount: processedRecords.length,
      machinesUpdated: Object.keys(machineStats).length,
      message: `Successfully collected ${processedRecords.length} new DEX records`,
      errors: fetchErrors.length > 0 ? fetchErrors : undefined,
      batching: {
        limit: batchLimit,
        offset: batchOffset,
        totalAvailable,
        hasMore,
        nextOffset
      }
    }), { status: 200, headers: { 'Content-Type': 'application/json' } })

  } catch (error) {
    console.error('Error collecting bulk DEX data:', error)
    console.error('Error stack:', error.stack)
    return new Response(JSON.stringify({
      success: false,
      error: error.message || 'Failed to collect bulk DEX data',
      stack: error.stack,
      details: error.toString()
    }), { status: 500, headers: { 'Content-Type': 'application/json' } })
  }
}
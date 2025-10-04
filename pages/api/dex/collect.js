import { getUserCompanyContext } from '../../../lib/supabase/server'
import { getUserDexCredentials } from '../../../lib/user-credentials'

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const { machineId } = req.body

    if (!machineId) {
      return res.status(400).json({
        success: false,
        error: 'Machine ID is required'
      })
    }

    // Get user context from Supabase auth
    const { user, companyId, error: authError } = await getUserCompanyContext(req)

    if (authError || !user) {
      return res.status(401).json({ error: 'Authentication required' })
    }

    console.log(`🔧 Starting DEX data collection for machine ${machineId}...`)

    // Step 1: Authenticate with Cantaloupe using working auth endpoint
    console.log('Authenticating with DEX platform...')

    const baseUrl = req.headers.origin || process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_LOCAL_URL || 'http://localhost:3000'
    const authResponse = await fetch(`${baseUrl}/api/cantaloupe/auth`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': req.headers.cookie || ''
      }
    })

    const authData = await authResponse.json()
    if (!authData.success) {
      throw new Error('Authentication failed with Cantaloupe')
    }

    const allCookies = authData.cookies
    console.log('Authentication successful!')

    // Get siteUrl from user credentials
    const credentials = await getUserDexCredentials(req)
    const siteUrl = credentials.siteUrl || 'https://dashboard.cantaloupe.online'

    // Step 2: Fetch DEX data for the machine
    console.log(`Fetching DEX data for machine ${machineId}...`)

    // Extract CSRF token
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
        /csrf[_-]?token['"]\s*:\s*['"]([^'"]+)['"]/i,
        /_token['"]\s*:\s*['"]([^'"]+)['"]/
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

    // Use the EXACT form data format from actual browser request
    const formData = new URLSearchParams();

    // Basic DataTables parameters - match browser exactly
    formData.append('draw', '1');
    formData.append('start', '0');
    formData.append('length', '25'); // Browser uses 25, not 100

    // Column definitions - EXACT from browser request
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
    ];

    columns.forEach((col, index) => {
      formData.append(`columns[${index}][data]`, col.data);
      formData.append(`columns[${index}][name]`, col.name);
      formData.append(`columns[${index}][searchable]`, col.searchable);
      formData.append(`columns[${index}][orderable]`, col.orderable);
      formData.append(`columns[${index}][search][value]`, '');
      formData.append(`columns[${index}][search][regex]`, 'false');
    });

    // Order by dexRaw.created descending (column 2) - exact from browser
    formData.append('order[0][column]', '2');
    formData.append('order[0][dir]', 'desc');

    // Root-level search parameters - required by browser
    formData.append('search[value]', '');
    formData.append('search[regex]', 'false');

    // Date range with proper timezone handling like browser
    const now = new Date();
    const timezoneOffset = now.getTimezoneOffset(); // in minutes

    // Create dates in local timezone like browser does
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 5, 26, 0); // Start at 5:26 AM like browser
    const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 0);

    // Format with timezone like browser: 2025-10-02T05:26:00+10:00
    const formatWithTimezone = (date) => {
      const offsetHours = Math.floor(Math.abs(timezoneOffset) / 60);
      const offsetMinutes = Math.abs(timezoneOffset) % 60;
      const sign = timezoneOffset <= 0 ? '+' : '-';
      const offsetString = `${sign}${offsetHours.toString().padStart(2, '0')}:${offsetMinutes.toString().padStart(2, '0')}`;

      const year = date.getFullYear();
      const month = (date.getMonth() + 1).toString().padStart(2, '0');
      const day = date.getDate().toString().padStart(2, '0');
      const hours = date.getHours().toString().padStart(2, '0');
      const minutes = date.getMinutes().toString().padStart(2, '0');
      const seconds = date.getSeconds().toString().padStart(2, '0');

      return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}${offsetString}`;
    };

    formData.append('startDateVal', formatWithTimezone(startOfDay));
    formData.append('endDateVal', formatWithTimezone(endOfDay));
    formData.append('offset', Math.abs(timezoneOffset).toString()); // Timezone offset in minutes like browser

    // Filter by device case serial if we want specific machine data
    if (machineId) {
      // Set search value to filter by case serial in the devices.caseSerial column
      formData.set(`columns[7][search][value]`, machineId); // devices.caseSerial column
    }

    console.log('Form data size:', formData.toString().length, 'bytes (browser had 2412)')
    console.log('Date range:', formatWithTimezone(startOfDay), 'to', formatWithTimezone(endOfDay))
    console.log('Timezone offset:', Math.abs(timezoneOffset), 'minutes')

    // Fetch DEX data via correct endpoint with proper DataTables format
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
      console.log(`DEX endpoint returned ${dexResponse.status} for machine ${machineId} - DEX data may not be available`)
      return res.status(200).json({
        success: true,
        recordsCount: 0,
        message: `No DEX data available for machine ${machineId} (API returned ${dexResponse.status})`
      })
    }

    const dexData = await dexResponse.json()
    console.log('DEX data received:', {
      recordsTotal: dexData.recordsTotal,
      recordsFiltered: dexData.recordsFiltered,
      dataLength: dexData.data?.length
    })

    if (!dexData.data || !Array.isArray(dexData.data)) {
      console.log('No DEX data available for machine', machineId)
      return res.status(200).json({
        success: true,
        message: 'No new DEX data available',
        recordsCount: 0
      })
    }

    // Step 3: Process and save DEX data to Supabase
    const { createServiceClient } = require('../../../lib/supabase/server')
    const { supabase } = createServiceClient()

    // First, get the actual machine record to find the case_serial
    const { data: machine, error: machineError } = await supabase
      .from('machines')
      .select('id, case_serial, company_id')
      .eq('case_serial', machineId) // machineId might be case_serial
      .eq('company_id', companyId)
      .single()

    if (machineError || !machine) {
      console.warn(`Machine not found for ID ${machineId}:`, machineError)
      return res.status(404).json({
        success: false,
        error: 'Machine not found in database'
      })
    }

    const processedDexRecords = []

    for (const dexRecord of dexData.data) {
      // DataTables response structure is different - handle both formats
      let dexId, rawData, parsedData, hasErrors, caseSerial

      if (dexRecord.DT_RowId || dexRecord.id) {
        // DataTables format
        dexId = dexRecord.DT_RowId || dexRecord.id
        rawData = dexRecord.raw || dexRecord.dexRaw?.raw || null
        parsedData = dexRecord.parsed || dexRecord.dexRaw?.parsed || dexRecord
        hasErrors = dexRecord.errors && dexRecord.errors.length > 0
        caseSerial = dexRecord.devices?.caseSerial || dexRecord.case_serial || machineId
      } else {
        // Fallback to original format
        dexId = dexRecord.id
        rawData = dexRecord.raw || null
        parsedData = dexRecord
        hasErrors = dexRecord.errors && dexRecord.errors.length > 0
        caseSerial = machine.case_serial
      }

      if (!dexId) {
        console.warn('Skipping invalid DEX record - no ID found:', dexRecord)
        continue
      }

      // Only process records for the requested machine
      if (caseSerial && caseSerial !== machineId && caseSerial !== machine.case_serial) {
        continue
      }

      const processedRecord = {
        dex_id: String(dexId),
        machine_id: machine.id, // Use the UUID from machines table
        case_serial: machine.case_serial,
        raw_data: rawData,
        parsed_data: parsedData,
        has_errors: hasErrors,
        record_count: parsedData && typeof parsedData === 'object' ? Object.keys(parsedData).length : 0,
        created_at: dexRecord.dexRaw?.created || new Date().toISOString() // Use actual DEX creation time from metadata
      }

      processedDexRecords.push(processedRecord)
    }

    console.log(`Processed ${processedDexRecords.length} DEX records for machine ${machine.case_serial}`)

    if (processedDexRecords.length === 0) {
      console.log('No new DEX records to save')
      return res.status(200).json({
        success: true,
        recordsCount: 0,
        message: 'No new DEX records available'
      })
    }

    // Save DEX records to Supabase (create table if needed)
    try {
      const { data: savedRecords, error: saveError } = await supabase
        .from('dex_captures')
        .upsert(processedDexRecords, {
          onConflict: 'dex_id'
        })
        .select()

      if (saveError) {
        console.error('Error saving DEX records:', saveError)
        throw saveError
      }

      console.log(`Saved ${savedRecords?.length || processedDexRecords.length} DEX records to database`)

      // Update machine's DEX statistics and history
      const hasErrors = processedDexRecords.some(record => record.has_errors)
      const latestCaptureTime = processedDexRecords.length > 0
        ? Math.max(...processedDexRecords.map(r => new Date(r.created_at).getTime()))
        : null

      // Get total DEX record count for this machine
      const { count: totalDexCount } = await supabase
        .from('dex_captures')
        .select('*', { count: 'exact', head: true })
        .eq('machine_id', machine.id)

      // Get current dex_history for this machine
      const { data: currentMachine } = await supabase
        .from('machines')
        .select('id, dex_history')
        .eq('id', machine.id)
        .single()

      const currentDexHistory = currentMachine?.dex_history || []

      // Build new DEX history entries from processed records
      const newDexEntries = processedDexRecords.map(record => ({
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

      // Get the most recent DEX creation time from the history
      const latestDexCreated = limitedDexHistory.length > 0 ? limitedDexHistory[0].created : null

      const { error: updateError } = await supabase
        .from('machines')
        .update({
          latest_dex_data: latestDexCreated, // Use actual DEX creation time from history
          dex_last_4hrs: processedDexRecords.length,
          dex_total_records: (totalDexCount || 0) + processedDexRecords.length,
          dex_last_capture: latestCaptureTime ? new Date(latestCaptureTime).toISOString() : null,
          dex_has_errors: hasErrors,
          dex_history: limitedDexHistory,
          updated_at: new Date().toISOString()
        })
        .eq('id', machine.id)

      if (updateError) {
        console.error('Error updating machine DEX timestamp:', updateError)
      }

    } catch (error) {
      console.error('Error saving DEX data:', error)
      // Continue with response even if save fails
    }

    return res.status(200).json({
      success: true,
      recordsCount: processedDexRecords.length,
      message: `Successfully collected ${processedDexRecords.length} DEX records`
    })

  } catch (error) {
    console.error('Error collecting DEX data:', error)
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to collect DEX data'
    })
  }
}
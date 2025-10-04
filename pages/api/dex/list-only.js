export const runtime = 'edge'

export default async function handler(req) {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: { 'Content-Type': 'application/json' } })
  }

  try {
    console.log('🔧 Starting DEX list-only collection...')

    // Step 1: Authenticate with Cantaloupe using internal auth endpoint
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

    // Use fixed siteUrl
    const siteUrl = 'https://dashboard.cantaloupe.online'

    // Step 2: Get CSRF token
    console.log('Extracting CSRF token...')
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

    // Step 3: Fetch full DEX JSON list from /dex endpoint
    console.log('Fetching complete DEX JSON list...')

    // Use the EXACT form data format from browser
    const formData = new URLSearchParams()

    // Basic DataTables parameters
    formData.append('draw', '1')
    formData.append('start', '0')
    formData.append('length', '1000') // Get more records to see full list

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
    ]

    columns.forEach((col, index) => {
      formData.append(`columns[${index}][data]`, col.data)
      formData.append(`columns[${index}][name]`, col.name)
      formData.append(`columns[${index}][searchable]`, col.searchable)
      formData.append(`columns[${index}][orderable]`, col.orderable)
      formData.append(`columns[${index}][search][value]`, '')
      formData.append(`columns[${index}][search][regex]`, 'false')
    })

    // Order by dexRaw.created descending
    formData.append('order[0][column]', '2')
    formData.append('order[0][dir]', 'desc')

    // Root-level search parameters
    formData.append('search[value]', '')
    formData.append('search[regex]', 'false')

    // Date range - get broader range to see more data
    const now = new Date()
    const timezoneOffset = now.getTimezoneOffset()

    // Get last 7 days of data
    const startDate = new Date(now.getTime() - (7 * 24 * 60 * 60 * 1000))
    const endDate = new Date(now.getTime() + (24 * 60 * 60 * 1000)) // Tomorrow

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

    formData.append('startDateVal', formatWithTimezone(startDate))
    formData.append('endDateVal', formatWithTimezone(endDate))
    formData.append('offset', Math.abs(timezoneOffset).toString())

    console.log('Date range:', formatWithTimezone(startDate), 'to', formatWithTimezone(endDate))
    console.log('Requesting 1000 records from last 7 days...')

    // Fetch DEX data using EXACT headers from your working request
    const dexResponse = await fetch(`${siteUrl}/dex`, {
      method: 'POST',
      headers: {
        'Accept': 'application/json, text/javascript, */*; q=0.01',
        'Accept-Encoding': 'gzip, deflate, br, zstd',
        'Accept-Language': 'en-US,en;q=0.9',
        'Cache-Control': 'no-cache',
        'Content-Length': formData.toString().length.toString(),
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
      body: formData.toString()
    })

    if (!dexResponse.ok) {
      throw new Error(`DEX endpoint returned ${dexResponse.status}: ${dexResponse.statusText}`)
    }

    const dexData = await dexResponse.json()

    console.log('📊 DEX Response Summary:', {
      recordsTotal: dexData.recordsTotal,
      recordsFiltered: dexData.recordsFiltered,
      dataLength: dexData.data?.length,
      drawNumber: dexData.draw
    })

    // Note: File saving removed for Edge Runtime compatibility
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
    const filename = `dex-list-only-${timestamp}.json`
    console.log(`📊 DEX data collected (would save to: ${filename})`)

    // Analyze the data structure
    const sampleRecord = dexData.data?.[0]
    const uniqueMachines = new Set()
    const dexIds = []

    if (dexData.data && Array.isArray(dexData.data)) {
      dexData.data.forEach(record => {
        // Extract machine info
        if (record.devices?.caseSerial) {
          uniqueMachines.add(record.devices.caseSerial)
        }

        // Extract DEX IDs
        if (record.DT_RowId) {
          dexIds.push(record.DT_RowId)
        } else if (record.id) {
          dexIds.push(record.id)
        }
      })
    }

    console.log('📈 Data Analysis:', {
      uniqueMachines: uniqueMachines.size,
      totalDexRecords: dexIds.length,
      sampleMachines: Array.from(uniqueMachines).slice(0, 5),
      sampleDexIds: dexIds.slice(0, 10)
    })

    return new Response(JSON.stringify({
      success: true,
      message: `Successfully fetched DEX list with ${dexData.recordsTotal} total records`,
      summary: {
        recordsTotal: dexData.recordsTotal,
        recordsFiltered: dexData.recordsFiltered,
        recordsReturned: dexData.data?.length || 0,
        uniqueMachines: uniqueMachines.size,
        dexIds: dexIds.length
      },
      fileSaved: filename,
      sampleData: {
        firstRecord: sampleRecord,
        machines: Array.from(uniqueMachines).slice(0, 10),
        dexIds: dexIds.slice(0, 20)
      }
    }), { status: 200, headers: { 'Content-Type': 'application/json' } })

  } catch (error) {
    console.error('Error fetching DEX list:', error)
    return new Response(JSON.stringify({
      success: false,
      error: error.message || 'Failed to fetch DEX list'
    }), { status: 500, headers: { 'Content-Type': 'application/json' } })
  }
}
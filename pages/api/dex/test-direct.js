import fs from 'fs'
import path from 'path'
import { getUserCompanyContext } from '../../../lib/supabase/server'
import { getUserDexCredentials } from '../../../lib/user-credentials'

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    console.log('🔧 Testing DEX endpoint with real user credentials from RLS...')

    // Get user context from Supabase auth
    const { user, companyId, error: authError } = await getUserCompanyContext(req)

    if (authError || !user) {
      return res.status(401).json({
        error: 'Authentication required',
        details: 'Must be logged in to access DEX data'
      })
    }

    console.log('✅ User authenticated:', user.email)
    console.log('✅ Company ID:', companyId)

    // Get user's DEX credentials from encrypted storage
    const credentials = await getUserDexCredentials(req)

    console.log('🔑 Credentials check:', {
      isConfigured: credentials.isConfigured,
      hasUsername: !!credentials.username,
      hasPassword: !!credentials.password,
      siteUrl: credentials.siteUrl,
      error: credentials.error
    })

    if (!credentials.isConfigured || !credentials.username || !credentials.password) {
      return res.status(400).json({
        error: credentials.error || 'DEX credentials not configured',
        needsConfiguration: true,
        message: 'Please configure your Cantaloupe credentials in settings before accessing DEX data'
      })
    }

    console.log('✅ Starting authentication with user credentials...')

    // Step 1: Get initial cookies from login page
    const loginPageResponse = await fetch(`${credentials.siteUrl}/login`, {
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1'
      }
    })

    const cookies = loginPageResponse.headers.get('set-cookie')
    console.log('Login page loaded, performing login...')

    // Step 2: Perform login
    const formData = new URLSearchParams()
    formData.append('email', credentials.username)
    formData.append('password', credentials.password)

    const loginResponse = await fetch(`${credentials.siteUrl}/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Cookie': cookies,
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Referer': `${credentials.siteUrl}/login`,
        'Origin': credentials.siteUrl,
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1'
      },
      body: formData,
      redirect: 'manual'
    })

    const authCookies = loginResponse.headers.get('set-cookie')
    const redirectLocation = loginResponse.headers.get('location')

    console.log('Login response:', {
      status: loginResponse.status,
      redirectLocation,
      hasCookies: !!authCookies
    })

    if (loginResponse.status !== 302 || !redirectLocation || redirectLocation.includes('/login')) {
      const responseText = await loginResponse.text()
      throw new Error(`Authentication failed: ${loginResponse.status}, redirect: ${redirectLocation}, body: ${responseText.substring(0, 200)}`)
    }

    // Step 3: Combine cookies
    let allCookies = ''
    const cookieMap = new Map()

    // Parse initial cookies
    if (cookies) {
      cookies.split(',').forEach(cookie => {
        const cleaned = cookie.trim().split(';')[0]
        const [name, value] = cleaned.split('=')
        if (name && value) {
          cookieMap.set(name.trim(), value.trim())
        }
      })
    }

    // Parse auth cookies
    if (authCookies) {
      authCookies.split(',').forEach(cookie => {
        const cleaned = cookie.trim().split(';')[0]
        const [name, value] = cleaned.split('=')
        if (name && value) {
          cookieMap.set(name.trim(), value.trim())
        }
      })
    }

    allCookies = Array.from(cookieMap.entries())
      .map(([name, value]) => `${name}=${value}`)
      .join('; ')

    console.log('✅ Authentication successful!')

    // Step 4: Get CSRF token
    console.log('Extracting CSRF token...')
    let csrfToken = null
    try {
      const dashResponse = await fetch(credentials.siteUrl, {
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

    // Step 5: Fetch DEX data
    console.log('📊 Fetching DEX data...')

    const formDataDex = new URLSearchParams()

    // Basic DataTables parameters
    formDataDex.append('draw', '1')
    formDataDex.append('start', '0')
    formDataDex.append('length', '100') // Get 100 records

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
      formDataDex.append(`columns[${index}][data]`, col.data)
      formDataDex.append(`columns[${index}][name]`, col.name)
      formDataDex.append(`columns[${index}][searchable]`, col.searchable)
      formDataDex.append(`columns[${index}][orderable]`, col.orderable)
      formDataDex.append(`columns[${index}][search][value]`, '')
      formDataDex.append(`columns[${index}][search][regex]`, 'false')
    })

    // Order by dexRaw.created descending
    formDataDex.append('order[0][column]', '2')
    formDataDex.append('order[0][dir]', 'desc')

    // Root-level search parameters
    formDataDex.append('search[value]', '')
    formDataDex.append('search[regex]', 'false')

    // Date range - last 7 days
    const now = new Date()
    const timezoneOffset = now.getTimezoneOffset()
    const startDate = new Date(now.getTime() - (7 * 24 * 60 * 60 * 1000))
    const endDate = new Date(now.getTime() + (24 * 60 * 60 * 1000))

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

    formDataDex.append('startDateVal', formatWithTimezone(startDate))
    formDataDex.append('endDateVal', formatWithTimezone(endDate))
    formDataDex.append('offset', Math.abs(timezoneOffset).toString())

    console.log('Requesting DEX data from last 7 days...')

    // Fetch DEX data
    const dexResponse = await fetch(`${credentials.siteUrl}/dex`, {
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
        'Origin': credentials.siteUrl,
        'Referer': `${credentials.siteUrl}/dex`,
        'Sec-CH-UA': '"Chromium";v="140", "Not=A?Brand";v="24", "Google Chrome";v="140"',
        'Sec-CH-UA-Mobile': '?0',
        'Sec-CH-UA-Platform': '"macOS"',
        'Sec-Fetch-Dest': 'empty',
        'Sec-Fetch-Mode': 'cors',
        'Sec-Fetch-Site': 'same-origin'
      },
      body: formDataDex.toString()
    })

    if (!dexResponse.ok) {
      const errorText = await dexResponse.text()
      throw new Error(`DEX endpoint returned ${dexResponse.status}: ${errorText.substring(0, 200)}`)
    }

    const dexData = await dexResponse.json()

    console.log('📊 DEX Response Summary:', {
      recordsTotal: dexData.recordsTotal,
      recordsFiltered: dexData.recordsFiltered,
      dataLength: dexData.data?.length
    })

    // Step 6: Save to file
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
    const filename = `dex-test-direct-${timestamp}.json`
    const filepath = path.join(process.cwd(), 'dex-data', filename)

    // Ensure directory exists
    const dir = path.dirname(filepath)
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true })
    }

    const fileData = {
      timestamp: new Date().toISOString(),
      summary: {
        recordsTotal: dexData.recordsTotal,
        recordsFiltered: dexData.recordsFiltered,
        dataLength: dexData.data?.length
      },
      dateRange: {
        start: formatWithTimezone(startDate),
        end: formatWithTimezone(endDate)
      },
      fullResponse: dexData
    }

    fs.writeFileSync(filepath, JSON.stringify(fileData, null, 2))
    console.log(`💾 DEX data saved to: ${filename}`)

    // Analyze data
    const uniqueMachines = new Set()
    const dexIds = []

    if (dexData.data && Array.isArray(dexData.data)) {
      dexData.data.forEach(record => {
        if (record.devices?.caseSerial) {
          uniqueMachines.add(record.devices.caseSerial)
        }
        if (record.DT_RowId) {
          dexIds.push(record.DT_RowId)
        } else if (record.id) {
          dexIds.push(record.id)
        }
      })
    }

    return res.status(200).json({
      success: true,
      message: `Successfully fetched DEX data with ${dexData.recordsTotal} total records`,
      summary: {
        recordsTotal: dexData.recordsTotal,
        recordsFiltered: dexData.recordsFiltered,
        recordsReturned: dexData.data?.length || 0,
        uniqueMachines: uniqueMachines.size,
        dexIds: dexIds.length
      },
      fileSaved: filename,
      sampleData: {
        machines: Array.from(uniqueMachines).slice(0, 10),
        dexIds: dexIds.slice(0, 20),
        firstRecord: dexData.data?.[0]
      }
    })

  } catch (error) {
    console.error('🚨 Error in DEX direct test:', error)
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to test DEX endpoint directly'
    })
  }
}
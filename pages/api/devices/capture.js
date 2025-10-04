import { getUserCompanyContext } from '../../../lib/supabase/server'
export const runtime = 'edge'

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    // Get user context from Supabase auth
    const { user, companyId, error: authError } = await getUserCompanyContext(req)

    if (authError || !user) {
      return res.status(401).json({ error: 'Authentication required' })
    }

    const userEmail = user.email
    console.log('🔧 Using authenticated user for device capture:', userEmail)

    console.log('🔧 Starting device capture process...')

    // Step 1: Authenticate with Cantaloupe using working auth endpoint
    console.log('Authenticating with DEX platform...')

    const baseUrl = req.headers.origin || process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_LOCAL_URL || 'http://localhost:3000'
    const authResponse = await fetch(`${baseUrl}/api/cantaloupe/auth`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // Forward user cookies for authentication
        'Cookie': req.headers.cookie || ''
      }
    })

    const authData = await authResponse.json()
    if (!authData.success) {
      throw new Error('Authentication failed with Cantaloupe')
    }

    const allCookies = authData.cookies
    console.log('Authentication successful!')
    console.log('Cookies length:', allCookies ? allCookies.length : 'null')

    // Get siteUrl from user credentials
    const { getUserDexCredentials } = require('../../../lib/user-credentials')
    const credentials = await getUserDexCredentials(req)
    const siteUrl = credentials.siteUrl || 'https://dashboard.cantaloupe.online'

    // Step 2: Fetch devices data
    console.log('Fetching devices from DEX platform...')

    // Extract CSRF token
    let csrfToken = null
    try {
      console.log('Fetching CSRF token from:', siteUrl)
      console.log('Using cookies for CSRF fetch:', allCookies ? allCookies.substring(0, 100) + '...' : 'null')

      const dashResponse = await fetch(siteUrl, {
        method: 'GET',
        headers: {
          'Cookie': allCookies,
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        }
      })

      console.log('Dashboard response status:', dashResponse.status)
      const dashHtml = await dashResponse.text()
      console.log('Dashboard HTML length:', dashHtml.length)
      console.log('Dashboard HTML preview:', dashHtml.substring(0, 500))
      const patterns = [
        /<meta\s+name="csrf-token"\s+content="([^"]+)"/i,
        /csrf[_-]?token['"]?\s*:\s*['"]([^'"]+)['"]/i,
        /_token['"]?\s*:\s*['"]([^'"]+)['"]/
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

    // Fetch devices data via working AJAX endpoint
    console.log('Attempting device fetch with CSRF token:', !!csrfToken)
    const devicesResponse = await fetch(`${siteUrl}/devices/getData`, {
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
        'Referer': `${siteUrl}/devices`,
        'Sec-CH-UA': '"Chromium";v="140", "Not=A?Brand";v="24", "Google Chrome";v="140"',
        'Sec-CH-UA-Mobile': '?0',
        'Sec-CH-UA-Platform': '"macOS"',
        'Sec-Fetch-Dest': 'empty',
        'Sec-Fetch-Mode': 'cors',
        'Sec-Fetch-Site': 'same-origin'
      },
      body: 'draw=1&columns[0][data]=devices.caseSerial&columns[0][name]=caseSerial&columns[0][searchable]=true&columns[0][orderable]=true&columns[0][search][value]=&columns[0][search][regex]=false&columns[1][data]=customers.name&columns[1][name]=customer&columns[1][searchable]=true&columns[1][orderable]=true&columns[1][search][value]=&columns[1][search][regex]=false&columns[2][data]=devices_location&columns[2][name]=location&columns[2][searchable]=true&columns[2][orderable]=false&columns[2][search][value]=&columns[2][search][regex]=false&columns[3][data]=devices.lastSeen&columns[3][name]=&columns[3][searchable]=true&columns[3][orderable]=true&columns[3][search][value]=&columns[3][search][regex]=false&columns[4][data]=devices.firmwareStr&columns[4][name]=firmwareStr&columns[4][searchable]=true&columns[4][orderable]=true&columns[4][search][value]=&columns[4][search][regex]=false&columns[5][data]=&columns[5][name]=stateRender&columns[5][searchable]=false&columns[5][orderable]=false&columns[5][search][value]=&columns[5][search][regex]=false&columns[6][data]=devices.signalStr&columns[6][name]=signalStr&columns[6][searchable]=true&columns[6][orderable]=true&columns[6][search][value]=&columns[6][search][regex]=false&columns[7][data]=devices.temp&columns[7][name]=temp&columns[7][searchable]=true&columns[7][orderable]=true&columns[7][search][value]=&columns[7][search][regex]=false&columns[8][data]=devices.error_bits&columns[8][name]=errorBits&columns[8][searchable]=true&columns[8][orderable]=true&columns[8][search][value]=&columns[8][search][regex]=false&columns[9][data]=devices.uptime&columns[9][name]=uptime&columns[9][searchable]=true&columns[9][orderable]=true&columns[9][search][value]=&columns[9][search][regex]=false&columns[10][data]=dexRaw.created&columns[10][name]=lastDEX&columns[10][searchable]=true&columns[10][orderable]=true&columns[10][search][value]=&columns[10][search][regex]=false&columns[11][data]=devices.vmName&columns[11][name]=vmName&columns[11][searchable]=true&columns[11][orderable]=false&columns[11][search][value]=&columns[11][search][regex]=false&columns[12][data]=&columns[12][name]=config&columns[12][searchable]=false&columns[12][orderable]=false&columns[12][search][value]=&columns[12][search][regex]=false&order[0][column]=3&order[0][dir]=desc&start=0&length=100&search[value]=&search[regex]=false&show_banned=false&show_inv=false&show_online=false&device_type_select='
    })

    console.log('Device fetch response status:', devicesResponse.status)
    console.log('Device fetch response headers:', Object.fromEntries(devicesResponse.headers.entries()))

    if (!devicesResponse.ok) {
      const errorText = await devicesResponse.text()
      console.log('Device fetch error response:', errorText)
      throw new Error(`Failed to fetch devices data from DEX platform: ${devicesResponse.status} - ${errorText}`)
    }

    const devicesData = await devicesResponse.json()
    console.log('Raw devices data received:', {
      recordsTotal: devicesData.recordsTotal,
      recordsFiltered: devicesData.recordsFiltered,
      dataLength: devicesData.data?.length
    })

    if (!devicesData.data || !Array.isArray(devicesData.data)) {
      throw new Error('Invalid devices data format received')
    }

    // Step 3: Process and save devices to Supabase
    // Create Supabase client early for location processing
    const { createServiceClient } = require('../../../lib/supabase/server')
    const { supabase } = createServiceClient()

    const processedDevices = []

    for (const deviceData of devicesData.data) {
      const device = deviceData.devices
      const customer = deviceData.customers
      const location = deviceData.devices_location

      if (!device || !device.caseSerial) {
        console.warn('Skipping invalid device data:', deviceData)
        continue
      }

      // Store location data as JSON object
      const locationData = location ? {
        optional: location.optional || 'Unknown Location',
        streetAddress: location.streetAddress || null,
        postcode: location.postcode || null,
        state: location.state || null,
        customer: customer?.name || 'Unknown Customer'
      } : null

      const processedDevice = {
        case_serial: device.caseSerial,
        company_id: companyId,
        location: locationData,
        machine_model: device.vmName ? device.vmName.replace(/<[^>]*>/g, '') : 'Unknown Model', // Strip HTML tags
        machine_type: 'snack', // Default to snack, could be enhanced later
        manufacturer: 'Cantaloupe', // Default manufacturer
        firmware_version: device.firmwareStr || null,
        status: device.state === 'approved' ? 'active' : 'inactive',
        notes: JSON.stringify({
          lastSeen: device.lastSeen,
          temperature: device.temp && device.temp !== "<h5><span class=\"badge text-bg-danger\">No Probe</span></h5>" ? device.temp : null,
          signalStrength: device.signalStr ? device.signalStr.replace(/<[^>]*>/g, '') : null,
          customer: customer?.name || 'Unknown Location',
          location: {
            streetAddress: location?.streetAddress || null,
            postcode: location?.postcode || null,
            state: location?.state || null,
            optional: location?.optional || null
          },
          rawDeviceData: deviceData
        }),
        updated_at: new Date().toISOString()
      }

      processedDevices.push(processedDevice)
    }

    console.log(`Processed ${processedDevices.length} devices`)

    // Save to Supabase machines table (using client created earlier)

    const { data, error } = await supabase
      .from('machines')
      .upsert(processedDevices, {
        onConflict: 'case_serial'
      })

    if (error) {
      console.error('Failed to save devices to Supabase:', error)
      throw new Error('Failed to save devices to database: ' + error.message)
    }

    console.log('Devices saved to Supabase successfully')

    return res.status(200).json({
      success: true,
      devicesCount: processedDevices.length,
      message: `Successfully captured and saved ${processedDevices.length} devices`,
      savedDevices: data
    })

  } catch (error) {
    console.error('Error capturing devices:', error)
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to capture devices'
    })
  }
}
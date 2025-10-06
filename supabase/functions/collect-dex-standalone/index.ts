// @ts-ignore
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
// @ts-ignore
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

/**
 * Standalone DEX collection - no Cloudflare Pages dependencies
 * Calls Cantaloupe API directly, parses DEX data, and saves to Supabase
 */

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Import DEX parsers (converted from lib/dex-*.js)
// These are pure JavaScript with no Node.js dependencies

function parseDexToKeyValue(rawContent) {
  // Full implementation from lib/dex-key-value-parser.js
  // Returns key-value pairs for all DEX data
  if (!rawContent || typeof rawContent !== 'string') return {}

  const lines = rawContent.split('\r\n').filter(line => line.trim())
  const keyValuePairs = {}

  for (const line of lines) {
    const segments = line.split('*')
    const segmentType = segments[0]

    try {
      switch (segmentType) {
        case 'CA17':
          // Coin Tube Data: CA17*{row}*{denomination_cents}*{count}
          const tubeRow = segments[1]
          const denominationCents = segments[2]
          const coinCount = segments[3]
          if (tubeRow && denominationCents && coinCount) {
            const denominationDollars = (parseInt(denominationCents) / 100).toFixed(2)
            const totalValue = (parseInt(denominationCents) * parseInt(coinCount) / 100).toFixed(2)

            keyValuePairs[`ca17_tube_${tubeRow}_denomination`] = denominationDollars
            keyValuePairs[`ca17_tube_${tubeRow}_count`] = coinCount
            keyValuePairs[`ca17_tube_${tubeRow}_total_value`] = totalValue
            keyValuePairs[`ca17_tube_${tubeRow}_raw`] = `${denominationCents}*${coinCount}`
          }
          break
        case 'PA1':
          const selection = segments[1]
          const price = parseInt(segments[2]) / 100
          keyValuePairs[`pa1_selection_${selection}_price`] = price.toFixed(2)
          break
        case 'PA2':
          const pa2Lines = lines.filter(l => l.startsWith('PA1*') || l.startsWith('PA2*'))
          const currentIndex = pa2Lines.findIndex(l => l === line)
          if (currentIndex > 0) {
            const prevPA1 = pa2Lines[currentIndex - 1]
            if (prevPA1 && prevPA1.startsWith('PA1*')) {
              const prevSelection = prevPA1.split('*')[1]
              keyValuePairs[`pa2_selection_${prevSelection}_sales_count`] = segments[1]
              keyValuePairs[`pa2_selection_${prevSelection}_sales_value`] = (parseInt(segments[2]) / 100).toFixed(2)
            }
          }
          break
        case 'VA1':
          keyValuePairs['va1_total_sales_value'] = (parseInt(segments[1]) / 100).toFixed(2)
          keyValuePairs['va1_total_sales_count'] = segments[2]
          break
        case 'EA1':
          // Event Activity: EA1*EGS*251002*1233
          const eventCode = segments[1]
          if (eventCode) {
            keyValuePairs[`ea1_event_${eventCode}_date`] = segments[2]
            keyValuePairs[`ea1_event_${eventCode}_time`] = segments[3]
          }
          break
        case 'EA2':
          // Event Activity Count: EA2*EAR*0*14**1
          const ea2Code = segments[1]
          if (ea2Code) {
            keyValuePairs[`ea2_event_${ea2Code}_count`] = segments[2]
            keyValuePairs[`ea2_event_${ea2Code}_value`] = segments[3]
          }
          break
        case 'MA5':
          const settingName = segments[1]
          if (settingName === 'ERROR') {
            const errorCodes = segments.slice(2).filter(Boolean)
            keyValuePairs['ma5_error_codes'] = errorCodes.join(',')
            errorCodes.forEach((code, idx) => {
              keyValuePairs[`ma5_error_${idx + 1}`] = code
            })
          } else if (settingName && settingName.toUpperCase().includes('TEMP')) {
            const rawTemp = segments[2]?.trim()
            const tempUnit = segments[3]

            // Convert temperature: divide by 10 for most machines
            let convertedTemp = null
            if (rawTemp) {
              const tempValue = parseFloat(rawTemp)
              if (!isNaN(tempValue)) {
                convertedTemp = tempValue > 100 ? (tempValue / 100).toFixed(1) : (tempValue / 10).toFixed(1)
              }
            }

            if (settingName.toUpperCase().includes('DESIRED')) {
              keyValuePairs['ma5_desired_temperature'] = convertedTemp
              keyValuePairs['ma5_desired_temperature_unit'] = tempUnit
            } else if (settingName.toUpperCase().includes('DETECTED')) {
              keyValuePairs['ma5_detected_temperature'] = convertedTemp
              keyValuePairs['ma5_detected_temperature_unit'] = tempUnit
            } else {
              keyValuePairs['ma5_detected_temperature'] = convertedTemp
              keyValuePairs['ma5_detected_temperature_unit'] = tempUnit
            }
          }
          break
      }
    } catch (error) {
      // Continue on error
    }
  }

  return keyValuePairs
}

function formatKeyValuePairs(keyValuePairs) {
  const groups = {
    products: {},
    sales: {},
    diagnostics: {},
    events: {}
  }

  for (const [key, value] of Object.entries(keyValuePairs)) {
    if (key.startsWith('pa1_') || key.startsWith('pa2_')) {
      groups.products[key] = value
    } else if (key.startsWith('va1_') || key.startsWith('ca17_')) {
      // Put CA17 coin data in sales group (UI expects it there)
      groups.sales[key] = value
    } else if (key.startsWith('ma5_')) {
      groups.diagnostics[key] = value
    } else if (key.startsWith('ea1_') || key.startsWith('ea2_')) {
      groups.events[key] = value
    }
  }

  return groups
}

function parseHybridDex(rawContent) {
  if (!rawContent || typeof rawContent !== 'string') {
    return { keyValue: {}, summary: {} }
  }

  const keyValue = parseDexToKeyValue(rawContent)
  const keyValueGroups = formatKeyValuePairs(keyValue)

  const summary = {
    totalSales: keyValue['va1_total_sales_value'] || '0.00',
    totalVends: keyValue['va1_total_sales_count'] || '0',
    hasErrors: !!keyValue['ma5_error_codes'],
    temperature: keyValue['ma5_detected_temperature'] || null,
    temperatureUnit: keyValue['ma5_detected_temperature_unit'] || null,
    desiredTemperature: keyValue['ma5_desired_temperature'] || null,
    errorCodes: keyValue['ma5_error_codes'] || null,
    hasEvents: Object.keys(keyValue).some(k => k.startsWith('ea1_') || k.startsWith('ea2_'))
  }

  return { keyValue, keyValueGroups, summary }
}

function getDeviceCardData(hybridData) {
  const { keyValue, summary } = hybridData

  return {
    totalSales: summary.totalSales,
    totalVends: summary.totalVends,
    hasErrors: summary.hasErrors,
    temperature: summary.temperature,
    temperatureUnit: summary.temperatureUnit,
    desiredTemperature: summary.desiredTemperature,
    errorCodes: summary.errorCodes,
    hasEvents: summary.hasEvents
  }
}

// Encryption helpers (Web Crypto API)
const IV_LENGTH = 16

function stringToUint8Array(str: string): Uint8Array {
  const encoder = new TextEncoder()
  return encoder.encode(str)
}

function uint8ArrayToString(arr: Uint8Array): string {
  const decoder = new TextDecoder()
  return decoder.decode(arr)
}

function hexToUint8Array(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2)
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substr(i, 2), 16)
  }
  return bytes
}

async function getKey(encryptionKey: string): Promise<CryptoKey> {
  const keyString = encryptionKey.padEnd(32, '0').slice(0, 32)
  const keyData = stringToUint8Array(keyString)
  return await crypto.subtle.importKey(
    'raw',
    keyData,
    { name: 'AES-CBC', length: 256 },
    false,
    ['decrypt']
  )
}

async function decrypt(encryptedText: string, encryptionKey: string): Promise<string | null> {
  if (!encryptedText) return null

  try {
    const textParts = encryptedText.split(':')
    const ivHex = textParts.shift()
    const encryptedHex = textParts.join(':')

    const iv = hexToUint8Array(ivHex!)
    const encryptedData = hexToUint8Array(encryptedHex)

    const key = await getKey(encryptionKey)

    const decryptedBuffer = await crypto.subtle.decrypt(
      { name: 'AES-CBC', iv },
      key,
      encryptedData
    )

    const decrypted = new Uint8Array(decryptedBuffer)
    return uint8ArrayToString(decrypted)
  } catch (error) {
    console.error('Decryption error:', error)
    return null
  }
}

// Authenticate with Cantaloupe
async function authenticate(username: string, password: string, siteUrl: string): Promise<string | null> {
  try {
    console.log('  → Authenticating with Cantaloupe...')

    // Get initial cookies from login page
    const loginPageResponse = await fetch(`${siteUrl}/login`, {
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1'
      }
    })

    const cookies = loginPageResponse.headers.get('set-cookie') || ''

    // Perform login
    const formData = new URLSearchParams()
    formData.append('email', username)
    formData.append('password', password)

    const loginResponse = await fetch(`${siteUrl}/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Cookie': cookies,
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Referer': `${siteUrl}/login`,
        'Origin': siteUrl,
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1'
      },
      body: formData,
      redirect: 'manual'
    })

    const authCookies = loginResponse.headers.get('set-cookie') || ''
    const redirectLocation = loginResponse.headers.get('location')

    if (loginResponse.status === 302 && redirectLocation && !redirectLocation.includes('/login')) {
      // Combine cookies
      const cookieMap = new Map()

      if (cookies) {
        cookies.split(',').forEach(cookie => {
          const cleaned = cookie.trim().split(';')[0]
          const [name, value] = cleaned.split('=')
          if (name && value) {
            cookieMap.set(name.trim(), value.trim())
          }
        })
      }

      if (authCookies) {
        authCookies.split(',').forEach(cookie => {
          const cleaned = cookie.trim().split(';')[0]
          const [name, value] = cleaned.split('=')
          if (name && value) {
            cookieMap.set(name.trim(), value.trim())
          }
        })
      }

      const allCookies = Array.from(cookieMap.entries())
        .map(([name, value]) => `${name}=${value}`)
        .join('; ')

      console.log('  ✓ Authentication successful')
      console.log('  → Cookie count:', cookieMap.size)
      console.log('  → Cookie names:', Array.from(cookieMap.keys()).join(', '))
      return allCookies
    } else {
      console.error('  ✗ Authentication failed')
      return null
    }
  } catch (error) {
    console.error('  ✗ Auth error:', error)
    return null
  }
}

// Fetch DEX metadata list
async function fetchDexMetadata(cookies: string, siteUrl: string): Promise<{ data: any[], csrfToken: string | null }> {
  try {
    console.log('  → Fetching DEX metadata...')

    // Get CSRF token
    let csrfToken = null
    try {
      const dashResponse = await fetch(`${siteUrl}/`, {
        method: 'GET',
        headers: {
          'Cookie': cookies,
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36'
        }
      })

      const dashHtml = await dashResponse.text()
      const patterns = [
        /<meta\s+name="csrf-token"\s+content="([^"]+)"/i,
        /csrf[_-]?token['"]?\s*:\s*['"]([^'"]+)['"]/i,
        /_token['"]?\s*:\s*['"]([^'"]+)['"]/
      ]

      for (const pattern of patterns) {
        const match = dashHtml.match(pattern)
        if (match) {
          csrfToken = match[1]
          console.log('  → Found CSRF token:', csrfToken.substring(0, 20) + '...')
          break
        }
      }

      if (!csrfToken) {
        console.log('  ⚠ No CSRF token found in dashboard HTML')
      }
    } catch (e) {
      console.error('  ⚠ Error fetching CSRF token:', e)
    }

    // Fetch DEX list with DataTables format (last 24 hours)
    const formData = new URLSearchParams()

    // Set date range to last 24 hours
    const now = new Date()
    const yesterday = new Date(now.getTime() - (24 * 60 * 60 * 1000))

    // Format dates in local timezone like the working version
    const formatWithTimezone = (date: Date) => {
      const year = date.getFullYear()
      const month = (date.getMonth() + 1).toString().padStart(2, '0')
      const day = date.getDate().toString().padStart(2, '0')
      const hours = date.getHours().toString().padStart(2, '0')
      const minutes = date.getMinutes().toString().padStart(2, '0')
      const seconds = date.getSeconds().toString().padStart(2, '0')
      const offsetMinutes = date.getTimezoneOffset()
      const offsetSign = offsetMinutes > 0 ? '-' : '+'
      const offsetHours = Math.floor(Math.abs(offsetMinutes) / 60).toString().padStart(2, '0')
      const offsetMins = (Math.abs(offsetMinutes) % 60).toString().padStart(2, '0')
      const offsetString = `${offsetSign}${offsetHours}:${offsetMins}`
      return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}${offsetString}`
    }

    // DataTables server-side processing parameters
    formData.append('draw', '1')

    // Column definitions (0-9) with all required fields
    formData.append('columns[0][data]', '')
    formData.append('columns[0][name]', '')
    formData.append('columns[0][searchable]', 'false')
    formData.append('columns[0][orderable]', 'false')
    formData.append('columns[0][search][value]', '')
    formData.append('columns[0][search][regex]', 'false')

    formData.append('columns[1][data]', '')
    formData.append('columns[1][name]', '')
    formData.append('columns[1][searchable]', 'false')
    formData.append('columns[1][orderable]', 'false')
    formData.append('columns[1][search][value]', '')
    formData.append('columns[1][search][regex]', 'false')

    formData.append('columns[2][data]', 'dexRaw.created')
    formData.append('columns[2][name]', '')
    formData.append('columns[2][searchable]', 'true')
    formData.append('columns[2][orderable]', 'true')
    formData.append('columns[2][search][value]', '')
    formData.append('columns[2][search][regex]', 'false')

    formData.append('columns[3][data]', 'dexRaw.parsed')
    formData.append('columns[3][name]', '')
    formData.append('columns[3][searchable]', 'true')
    formData.append('columns[3][orderable]', 'false')
    formData.append('columns[3][search][value]', '')
    formData.append('columns[3][search][regex]', 'false')

    formData.append('columns[4][data]', 'dexRaw.uploadReason')
    formData.append('columns[4][name]', '')
    formData.append('columns[4][searchable]', 'true')
    formData.append('columns[4][orderable]', 'false')
    formData.append('columns[4][search][value]', '')
    formData.append('columns[4][search][regex]', 'false')

    formData.append('columns[5][data]', 'dexRaw.dexSource')
    formData.append('columns[5][name]', '')
    formData.append('columns[5][searchable]', 'true')
    formData.append('columns[5][orderable]', 'false')
    formData.append('columns[5][search][value]', '')
    formData.append('columns[5][search][regex]', 'false')

    formData.append('columns[6][data]', 'dexRaw.firmware')
    formData.append('columns[6][name]', '')
    formData.append('columns[6][searchable]', 'true')
    formData.append('columns[6][orderable]', 'false')
    formData.append('columns[6][search][value]', '')
    formData.append('columns[6][search][regex]', 'false')

    formData.append('columns[7][data]', 'devices.caseSerial')
    formData.append('columns[7][name]', '')
    formData.append('columns[7][searchable]', 'true')
    formData.append('columns[7][orderable]', 'false')
    formData.append('columns[7][search][value]', '')
    formData.append('columns[7][search][regex]', 'false')

    formData.append('columns[8][data]', 'customers.name')
    formData.append('columns[8][name]', '')
    formData.append('columns[8][searchable]', 'true')
    formData.append('columns[8][orderable]', 'false')
    formData.append('columns[8][search][value]', '')
    formData.append('columns[8][search][regex]', 'false')

    formData.append('columns[9][data]', 'vdiToDEX')
    formData.append('columns[9][name]', '')
    formData.append('columns[9][searchable]', 'true')
    formData.append('columns[9][orderable]', 'false')
    formData.append('columns[9][search][value]', '')
    formData.append('columns[9][search][regex]', 'false')

    // Order by column 2 (dexRaw.created) descending
    formData.append('order[0][column]', '2')
    formData.append('order[0][dir]', 'desc')

    // Pagination
    formData.append('start', '0')
    formData.append('length', '100')

    // Global search
    formData.append('search[value]', '')
    formData.append('search[regex]', 'false')

    // Date range and timezone
    formData.append('startDateVal', formatWithTimezone(yesterday))
    formData.append('endDateVal', formatWithTimezone(now))
    formData.append('offset', Math.abs(now.getTimezoneOffset()).toString())

    // Cache buster timestamp (DataTables convention)
    formData.append('_', Date.now().toString())

    const headers: any = {
      'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
      'Cookie': cookies,
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36',
      'Accept': 'application/json, text/javascript, */*; q=0.01',
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept-Encoding': 'gzip, deflate, br, zstd',
      'Cache-Control': 'no-cache',
      'Pragma': 'no-cache',
      'Priority': 'u=1, i',
      'X-Requested-With': 'XMLHttpRequest',
      'Origin': siteUrl,
      'Referer': `${siteUrl}/dex`,
      'Sec-Ch-Ua': '"Chromium";v="140", "Not=A?Brand";v="24", "Google Chrome";v="140"',
      'Sec-Ch-Ua-Mobile': '?0',
      'Sec-Ch-Ua-Platform': '"macOS"',
      'Sec-Fetch-Dest': 'empty',
      'Sec-Fetch-Mode': 'cors',
      'Sec-Fetch-Site': 'same-origin'
    }

    if (csrfToken) {
      headers['X-CSRF-TOKEN'] = csrfToken
    }

    const response = await fetch(`${siteUrl}/dex`, {
      method: 'POST',
      headers,
      body: formData
    })

    console.log(`  → DEX metadata response status: ${response.status}`)
    console.log(`  → Response headers:`, JSON.stringify(Object.fromEntries(response.headers.entries())))

    const responseText = await response.text()
    console.log(`  → Raw response (first 500 chars):`, responseText.substring(0, 500))

    let result
    try {
      result = JSON.parse(responseText)
    } catch (e) {
      console.error(`  ✗ Failed to parse JSON response:`, e)
      console.log(`  → Full response:`, responseText)
      return []
    }

    console.log(`  → DEX metadata response:`, JSON.stringify(result).substring(0, 200))
    console.log(`  ✓ Found ${result.data?.length || 0} DEX metadata records`)
    return { data: result.data || [], csrfToken }
  } catch (error) {
    console.error('  ✗ Error fetching DEX metadata:', error)
    return { data: [], csrfToken: null }
  }
}

// Fetch raw DEX data
async function fetchRawDex(dexId: string, cookies: string, siteUrl: string, csrfToken: string | null): Promise<string | null> {
  try {
    const url = `${siteUrl}/dex/getRawDex/${dexId}`

    const formData = new URLSearchParams()
    formData.append('dexId', dexId)

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Accept': 'text/plain, */*',
        'Accept-Language': 'en-US,en;q=0.9',
        'Cache-Control': 'no-cache',
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        'Cookie': cookies,
        'Origin': siteUrl,
        'Pragma': 'no-cache',
        'Priority': 'u=1, i',
        'Referer': `${siteUrl}/dex`,
        'Sec-Ch-Ua': '"Chromium";v="140", "Not=A?Brand";v="24", "Google Chrome";v="140"',
        'Sec-Ch-Ua-Mobile': '?0',
        'Sec-Ch-Ua-Platform': '"macOS"',
        'Sec-Fetch-Dest': 'empty',
        'Sec-Fetch-Mode': 'cors',
        'Sec-Fetch-Site': 'same-origin',
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36',
        'X-CSRF-TOKEN': csrfToken || '',
        'X-Requested-With': 'XMLHttpRequest'
      },
      body: formData.toString()
    })

    if (response.status !== 200) {
      console.log(`    ✗ Non-200 status for DEX ${dexId}: ${response.status}`)
      return null
    }

    // The API returns raw DEX data as plain text
    const rawDexText = await response.text()

    if (!rawDexText || rawDexText.length === 0) {
      console.log(`    ✗ Empty response for DEX ${dexId}`)
      return null
    }

    console.log(`    ✓ Fetched raw DEX ${dexId}: ${rawDexText.length} bytes`)
    return rawDexText
  } catch (error) {
    console.error(`  ✗ Error fetching raw DEX ${dexId}:`, error)
    return null
  }
}

// @ts-ignore
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // No authentication required - this is called from trusted pg_cron
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const encryptionKey = Deno.env.get('ENCRYPTION_KEY')!

    if (!encryptionKey) {
      throw new Error('ENCRYPTION_KEY environment variable not set')
    }

    // Create Supabase client with service role
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    console.log('🕐 Starting standalone DEX collection...')

    // Get all companies with DEX credentials
    const { data: credentials, error: credError } = await supabase
      .from('user_credentials')
      .select(`
        company_id,
        username_encrypted,
        password_encrypted,
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

    for (const cred of credentials || []) {
      try {
        const companyName = cred.companies?.company_name || 'Unknown'
        const companyId = cred.company_id

        console.log(`\n📦 Collecting DEX for: ${companyName} (${companyId})`)

        // Decrypt credentials
        const username = await decrypt(cred.username_encrypted, encryptionKey)
        const password = await decrypt(cred.password_encrypted, encryptionKey)
        const siteUrl = cred.site_url || 'https://dashboard.cantaloupe.online'

        if (!username || !password) {
          throw new Error('Failed to decrypt credentials')
        }

        // Authenticate with Cantaloupe
        const cookies = await authenticate(username, password, siteUrl)
        if (!cookies) {
          throw new Error('Authentication failed')
        }

        // Fetch DEX metadata (last 24 hours)
        const { data: metadata, csrfToken } = await fetchDexMetadata(cookies, siteUrl)
        if (metadata.length === 0) {
          console.log('  ⚠ No DEX metadata found')
          results.push({
            company_id: companyId,
            company_name: companyName,
            success: true,
            recordsCollected: 0
          })
          continue
        }

        console.log(`  → Fetched ${metadata.length} DEX records from Cantaloupe API`)

        // Get all machines for this company with their latest DEX timestamps
        const { data: machines, error: machinesError } = await supabase
          .from('machines')
          .select('id, case_serial, company_id, latest_dex_data')
          .eq('company_id', companyId)

        if (machinesError || !machines) {
          console.log(`  ⚠ Failed to fetch machines: ${machinesError?.message}`)
          results.push({
            company_id: companyId,
            company_name: companyName,
            success: false,
            error: `Failed to fetch machines: ${machinesError?.message}`
          })
          continue
        }

        // Create a map of case_serial -> latest_dex_data timestamp
        const machineMap = {}
        machines.forEach(machine => {
          machineMap[machine.case_serial] = {
            ...machine,
            latestTimestamp: machine.latest_dex_data ? new Date(machine.latest_dex_data) : null
          }
        })

        console.log(`  → Found ${machines.length} machines in database`)

        // Filter to only records that are newer than what we have for each machine
        const newRecords = metadata.filter(record => {
          const caseSerial = record.devices?.caseSerial
          const dexCreated = record.dexRaw?.created

          if (!caseSerial || !dexCreated) return false

          const machine = machineMap[caseSerial]
          if (!machine) {
            console.log(`  ⚠ Machine not found for case_serial: ${caseSerial}`)
            return false
          }

          // If machine has no latest_dex_data, fetch this DEX
          if (!machine.latestTimestamp) {
            return true
          }

          // Only fetch if this DEX is newer than what we have
          const recordTimestamp = new Date(dexCreated)
          return recordTimestamp > machine.latestTimestamp
        })

        console.log(`  → Found ${newRecords.length} new/updated DEX records to fetch`)

        if (newRecords.length === 0) {
          results.push({
            company_id: companyId,
            company_name: companyName,
            success: true,
            recordsCollected: 0
          })
          continue
        }

        // Fetch raw DEX for new records
        const dexRecordsToSave = []
        const machineUpdates = new Map()

        for (const record of newRecords) {
          const dexId = record.dexRaw?.id
          const caseSerial = record.devices?.caseSerial

          if (!dexId || !caseSerial) {
            console.log(`  ⚠ Skipping record - missing dexId or caseSerial:`, { dexId, caseSerial, record })
            continue
          }

          console.log(`  → Fetching raw DEX ${dexId} for ${caseSerial}`)

          const rawDex = await fetchRawDex(String(dexId), cookies, siteUrl, csrfToken)
          if (!rawDex) {
            console.log(`  ⚠ Failed to fetch raw DEX ${dexId}`)
            continue
          }

          console.log(`  ✓ Fetched raw DEX ${dexId} (${rawDex.length} bytes)`)

          // Look up machine by case_serial
          const machine = machineMap[caseSerial]
          if (!machine) {
            console.log(`  ⚠ Machine not found for case_serial: ${caseSerial}`)
            continue
          }

          // Parse the raw DEX content
          const hybridData = parseHybridDex(rawDex)
          const deviceCardData = getDeviceCardData(hybridData)

          // Prepare DEX record for saving (match schema from /collect-bulk)
          dexRecordsToSave.push({
            dex_id: String(dexId),
            machine_id: machine.id, // Use actual machine_id from lookup
            case_serial: caseSerial,
            company_id: companyId,
            raw_content: rawDex,
            parsed_data: {
              // Include hybrid summary data for device cards
              hybridData: {
                summary: hybridData.summary,
                keyValue: hybridData.keyValue,
                keyValueGroups: hybridData.keyValueGroups
              },
              // Include device card ready data
              deviceCardData: deviceCardData,
              // Basic metadata
              actualDexId: String(dexId),
              rawLength: rawDex.length,
              startsWithDXS: rawDex.startsWith('DXS*')
            },
            has_errors: hybridData.summary.hasErrors || false,
            record_count: rawDex.split('\n').length,
            created_at: record.dexRaw.created // Use actual DEX creation time from metadata
          })

          console.log(`  ✓ Parsed DEX ${dexId} - ${hybridData.summary.totalVends} vends, $${hybridData.summary.totalSales}`)

          // Track machine updates - keep the LATEST DEX for each machine
          const currentUpdate = machineUpdates.get(caseSerial)
          if (!currentUpdate || new Date(record.dexRaw.created) > new Date(currentUpdate.created)) {
            machineUpdates.set(caseSerial, {
              case_serial: caseSerial,
              company_id: companyId,
              dex_id: String(dexId),
              created: record.dexRaw.created, // Use actual DEX creation time from metadata
              parsed_data: {
                hybridData: {
                  summary: hybridData.summary,
                  keyValue: hybridData.keyValue,
                  keyValueGroups: hybridData.keyValueGroups
                },
                deviceCardData: deviceCardData
              }
            })
          }
        }

        console.log(`  → Saving ${dexRecordsToSave.length} DEX records to database...`)

        // Save to Supabase
        if (dexRecordsToSave.length > 0) {
          const { error: saveError } = await supabase
            .from('dex_captures')
            .insert(dexRecordsToSave)

          if (saveError) {
            throw new Error(`Failed to save DEX records: ${saveError.message}`)
          }

          console.log(`  ✓ Saved ${dexRecordsToSave.length} DEX records`)
        }

        // Update machine metadata and dex_history
        for (const [caseSerial, update] of machineUpdates.entries()) {
          try {
            // Get current machine record with existing errors
            const { data: machine, error: fetchMachineError } = await supabase
              .from('machines')
              .select('id, dex_history, latest_errors')
              .eq('case_serial', caseSerial)
              .eq('company_id', companyId)
              .single()

            if (fetchMachineError || !machine) {
              console.log(`  ⚠ Machine not found: ${caseSerial}`)
              continue
            }

            // Update dex_history
            const dexHistory = machine.dex_history || []

            // Add new DEX entry if not already present
            const newEntry = {
              dexId: update.dex_id,
              created: update.created
            }

            const existingDexIds = new Set(dexHistory.map(entry => entry.dexId))
            if (!existingDexIds.has(newEntry.dexId)) {
              dexHistory.push(newEntry)
            }

            // Sort by created date (newest first) and limit to last 100 entries
            dexHistory.sort((a, b) => new Date(b.created) - new Date(a.created))
            const limitedDexHistory = dexHistory.slice(0, 100)

            // Get the most recent DEX timestamp from the sorted history
            const latestDexTimestamp = limitedDexHistory.length > 0 ? limitedDexHistory[0].created : update.created

            // Extract EA1 and MA5 errors from latest parsed data
            const existingErrors = machine.latest_errors || []
            const newErrors = []

            // Extract EA1 errors (persistent with timestamp)
            if (update.parsed_data?.hybridData?.keyValueGroups?.events) {
              const events = update.parsed_data.hybridData.keyValueGroups.events
              const ea1Keys = Object.keys(events).filter(key => key.match(/^ea1_event_\w+_date$/))

              for (const dateKey of ea1Keys) {
                const code = dateKey.replace('ea1_event_', '').replace('_date', '')
                const timeKey = `ea1_event_${code}_time`
                const date = events[dateKey] // Format: YYMMDD (e.g., "251006")
                const time = events[timeKey] // Format: HHMM (e.g., "1123")

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
            if (update.parsed_data?.hybridData?.keyValueGroups?.diagnostics?.ma5_error_codes) {
              const ma5Codes = update.parsed_data.hybridData.keyValueGroups.diagnostics.ma5_error_codes.split(',')
              const captureTimestamp = update.created || new Date().toISOString()

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

            // Process new errors from this DEX capture
            newErrors.forEach(newError => {
              // Check if this exact error already exists (same code AND timestamp)
              const existingError = existingErrors.find(e => {
                if (newError.type === 'EA1') {
                  // For EA1: match by code AND timestamp
                  return e.type === 'EA1' && e.code === newError.code && e.timestamp === newError.timestamp
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
                  e.type === 'EA1' && e.code === oldError.code && e.timestamp === oldError.timestamp
                )

                // Check if there's ANY newer error with the same code (different timestamp)
                const newerErrorWithSameCode = newErrors.find(e =>
                  e.type === 'EA1' && e.code === oldError.code
                )

                // Only keep old actioned error if:
                // 1. It's not an exact match (already handled above)
                // 2. There's no newer error with the same code
                if (!exactMatch && !newerErrorWithSameCode) {
                  mergedErrors.push(oldError)
                }
              }
            })

            const latestErrors = mergedErrors

            // Update machine with correct field names from /collect-bulk
            const { error: updateError } = await supabase
              .from('machines')
              .update({
                latest_dex_data: latestDexTimestamp, // Use most recent from history
                latest_dex_parsed: update.parsed_data, // Store latest parsed_data for device cards
                latest_errors: latestErrors, // Store EA1/MA5 errors with action status
                dex_last_capture: latestDexTimestamp,
                dex_last_4hrs: 1, // Count (will be updated by the 4-hour flag update below)
                dex_history: limitedDexHistory,
                updated_at: new Date().toISOString()
              })
              .eq('id', machine.id)

            if (updateError) {
              console.log(`  ⚠ Failed to update machine ${caseSerial}: ${updateError.message}`)
            } else {
              console.log(`  ✓ Updated machine ${caseSerial} - ${latestErrors.length} errors tracked`)
            }
          } catch (error) {
            console.log(`  ⚠ Error updating machine ${caseSerial}:`, error)
          }
        }

        results.push({
          company_id: companyId,
          company_name: companyName,
          success: true,
          recordsCollected: dexRecordsToSave.length
        })

        console.log(`✅ ${companyName}: ${dexRecordsToSave.length} records collected`)

      } catch (error) {
        console.error(`❌ Error for company ${cred.company_id}:`, error)
        results.push({
          company_id: cred.company_id,
          company_name: cred.companies?.company_name || 'Unknown',
          success: false,
          error: error.message
        })
      }

      // Delay between companies
      await new Promise(resolve => setTimeout(resolve, 2000))
    }

    const successCount = results.filter(r => r.success).length
    const totalRecords = results.reduce((sum, r) => sum + (r.recordsCollected || 0), 0)

    console.log(`\n✅ Collection complete: ${successCount}/${results.length} companies, ${totalRecords} records`)

    // Update 4-hour DEX flags for all machines
    console.log('\n🕐 Updating 4-hour DEX flags...')
    const now = new Date()
    const fourHoursAgo = new Date(now.getTime() - (4 * 60 * 60 * 1000))

    // Get all machines with their dex_history
    const { data: allMachines, error: fetchMachinesError } = await supabase
      .from('machines')
      .select('id, case_serial, dex_history')

    if (!fetchMachinesError && allMachines) {
      const flagUpdates = []
      let hasRecentCount = 0
      let noRecentCount = 0

      for (const machine of allMachines) {
        const dexHistory = machine.dex_history || []

        // Check if any DEX capture in history is within last 4 hours
        const hasRecentDex = dexHistory.some(entry => {
          const createdDate = new Date(entry.created)
          return createdDate > fourHoursAgo
        })

        // Count DEX entries in last 4 hours
        const recentDexCount = dexHistory.filter(entry => {
          const createdDate = new Date(entry.created)
          return createdDate > fourHoursAgo
        }).length

        flagUpdates.push({
          id: machine.id,
          dex_last_4hrs: recentDexCount // Should be a number, not 'Yes'/'No'
        })

        if (hasRecentDex) {
          hasRecentCount++
        } else {
          noRecentCount++
        }
      }

      // Update each machine individually (can't use upsert as it requires all NOT NULL columns)
      if (flagUpdates.length > 0) {
        let successCount = 0
        let errorCount = 0

        for (const update of flagUpdates) {
          const { error: updateFlagsError } = await supabase
            .from('machines')
            .update({ dex_last_4hrs: update.dex_last_4hrs })
            .eq('id', update.id)

          if (updateFlagsError) {
            errorCount++
          } else {
            successCount++
          }
        }

        if (errorCount > 0) {
          console.error(`⚠️ Failed to update ${errorCount} machine 4-hour flags`)
        }
        if (successCount > 0) {
          console.log(`✅ Updated 4-hour flags: ${hasRecentCount} with recent DEX, ${noRecentCount} without (${successCount}/${flagUpdates.length} succeeded)`)
        }
      }
    } else {
      console.error('⚠️ Failed to fetch machines for flag update:', fetchMachinesError?.message)
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
    console.error('❌ Standalone collection error:', error)
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

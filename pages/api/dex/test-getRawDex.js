import { getUserCompanyContext } from '../../../lib/supabase/server'
import { getUserDexCredentials } from '../../../lib/user-credentials'

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    console.log('🔧 Testing different approaches for /dex/getRawDex/{dexId}...')

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
    const credentials = { siteUrl: 'https://dashboard.cantaloupe.online' }

    // Step 2: Get CSRF token
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
        /<meta\\s+name="csrf-token"\\s+content="([^"]+)"/i,
        /csrf[_-]?token['\"]\\s*:\\s*['\"]([^'\"]+)['\"]/i,
        /_token['\"]\\s*:\\s*['\"]([^'\"]+)['\"]/
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

    // Step 5: Test different dexId values and approaches
    const testResults = []

    // Sample dexIds to test (these should be real IDs from recent data)
    const testDexIds = ['23490596', '23490563', '23490540', '23489710']

    for (const dexId of testDexIds) {
      console.log(`\\n🧪 Testing dexId: ${dexId}`)

      // Test 1: GET request (current approach)
      try {
        console.log('  → Testing GET /dex/getRawDex/' + dexId)
        const getResponse = await fetch(`${credentials.siteUrl}/dex/getRawDex/${dexId}`, {
          method: 'GET',
          headers: {
            'Accept': 'application/json, text/javascript, */*; q=0.01',
            'Accept-Encoding': 'gzip, deflate, br, zstd',
            'Accept-Language': 'en-US,en;q=0.9',
            'Cache-Control': 'no-cache',
            'Cookie': allCookies,
            'Pragma': 'no-cache',
            'Referer': `${credentials.siteUrl}/dex`,
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36',
            'X-CSRF-TOKEN': csrfToken || '',
            'X-Requested-With': 'XMLHttpRequest'
          }
        })

        testResults.push({
          dexId,
          method: 'GET',
          url: `/dex/getRawDex/${dexId}`,
          status: getResponse.status,
          statusText: getResponse.statusText,
          success: getResponse.ok
        })

        if (getResponse.ok) {
          console.log('  ✅ GET succeeded!')
          break // Found working approach
        } else {
          console.log(`  ❌ GET failed: ${getResponse.status} ${getResponse.statusText}`)
        }
      } catch (error) {
        testResults.push({
          dexId,
          method: 'GET',
          url: `/dex/getRawDex/${dexId}`,
          error: error.message,
          success: false
        })
        console.log(`  ❌ GET error: ${error.message}`)
      }

      // Test 2: POST request with form data
      try {
        console.log('  → Testing POST /dex/getRawDex/' + dexId)
        const postFormData = new URLSearchParams()
        postFormData.append('dexId', dexId)

        const postResponse = await fetch(`${credentials.siteUrl}/dex/getRawDex/${dexId}`, {
          method: 'POST',
          headers: {
            'Accept': 'application/json, text/javascript, */*; q=0.01',
            'Accept-Encoding': 'gzip, deflate, br, zstd',
            'Accept-Language': 'en-US,en;q=0.9',
            'Cache-Control': 'no-cache',
            'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
            'Cookie': allCookies,
            'Origin': credentials.siteUrl,
            'Pragma': 'no-cache',
            'Referer': `${credentials.siteUrl}/dex`,
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36',
            'X-CSRF-TOKEN': csrfToken || '',
            'X-Requested-With': 'XMLHttpRequest'
          },
          body: postFormData.toString()
        })

        testResults.push({
          dexId,
          method: 'POST',
          url: `/dex/getRawDex/${dexId}`,
          status: postResponse.status,
          statusText: postResponse.statusText,
          success: postResponse.ok
        })

        if (postResponse.ok) {
          console.log('  ✅ POST succeeded!')
          break // Found working approach
        } else {
          console.log(`  ❌ POST failed: ${postResponse.status} ${postResponse.statusText}`)
        }
      } catch (error) {
        testResults.push({
          dexId,
          method: 'POST',
          url: `/dex/getRawDex/${dexId}`,
          error: error.message,
          success: false
        })
        console.log(`  ❌ POST error: ${error.message}`)
      }

      // Test 3: Different URL format - maybe it's /dex/raw/{dexId}
      try {
        console.log('  → Testing GET /dex/raw/' + dexId)
        const altResponse = await fetch(`${credentials.siteUrl}/dex/raw/${dexId}`, {
          method: 'GET',
          headers: {
            'Accept': 'application/json, text/javascript, */*; q=0.01',
            'Cookie': allCookies,
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36',
            'X-CSRF-TOKEN': csrfToken || '',
            'X-Requested-With': 'XMLHttpRequest'
          }
        })

        testResults.push({
          dexId,
          method: 'GET',
          url: `/dex/raw/${dexId}`,
          status: altResponse.status,
          statusText: altResponse.statusText,
          success: altResponse.ok
        })

        if (altResponse.ok) {
          console.log('  ✅ Alternative URL succeeded!')
          break // Found working approach
        } else {
          console.log(`  ❌ Alternative URL failed: ${altResponse.status} ${altResponse.statusText}`)
        }
      } catch (error) {
        testResults.push({
          dexId,
          method: 'GET',
          url: `/dex/raw/${dexId}`,
          error: error.message,
          success: false
        })
        console.log(`  ❌ Alternative URL error: ${error.message}`)
      }

      // Test 4: Try with row ID format (row_23489710)
      try {
        const rowId = `row_${dexId}`
        console.log('  → Testing GET /dex/getRawDex/' + rowId)
        const rowResponse = await fetch(`${credentials.siteUrl}/dex/getRawDex/${rowId}`, {
          method: 'GET',
          headers: {
            'Accept': 'application/json, text/javascript, */*; q=0.01',
            'Cookie': allCookies,
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36',
            'X-CSRF-TOKEN': csrfToken || '',
            'X-Requested-With': 'XMLHttpRequest'
          }
        })

        testResults.push({
          dexId: rowId,
          method: 'GET',
          url: `/dex/getRawDex/${rowId}`,
          status: rowResponse.status,
          statusText: rowResponse.statusText,
          success: rowResponse.ok
        })

        if (rowResponse.ok) {
          console.log('  ✅ Row ID format succeeded!')
          break // Found working approach
        } else {
          console.log(`  ❌ Row ID format failed: ${rowResponse.status} ${rowResponse.statusText}`)
        }
      } catch (error) {
        testResults.push({
          dexId: `row_${dexId}`,
          method: 'GET',
          url: `/dex/getRawDex/row_${dexId}`,
          error: error.message,
          success: false
        })
        console.log(`  ❌ Row ID format error: ${error.message}`)
      }
    }

    console.log('\\n📊 Test Results Summary:')
    testResults.forEach(result => {
      console.log(`  ${result.success ? '✅' : '❌'} ${result.method} ${result.url} - ${result.status || 'ERROR'} ${result.statusText || result.error || ''}`)
    })

    return res.status(200).json({
      success: true,
      message: 'Completed testing different approaches for getRawDex endpoint',
      testResults,
      summary: {
        totalTests: testResults.length,
        successfulTests: testResults.filter(r => r.success).length,
        failedTests: testResults.filter(r => !r.success).length
      },
      recommendations: testResults.filter(r => r.success).length > 0
        ? 'Found working approach(es) - see successful tests above'
        : 'All approaches failed - the endpoint may not exist or may require different authentication/parameters'
    })

  } catch (error) {
    console.error('🚨 Error testing getRawDex approaches:', error)
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to test getRawDex approaches'
    })
  }
}
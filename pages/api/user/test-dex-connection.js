import { getUserDexCredentials } from '../../../lib/user-credentials'
export const runtime = 'edge'

export default async function handler(req) {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: { 'Content-Type': 'application/json' } })
  }

  try {
    // Get user-specific DEX credentials
    const credentials = await getUserDexCredentials(req)

    if (!credentials.isConfigured || !credentials.username || !credentials.password) {
      return new Response(JSON.stringify({
        success: false,
        error: credentials.error || 'DEX credentials not configured'
      }), { status: 400, headers: { 'Content-Type': 'application/json' } })
    }

    const { username, password, siteUrl } = credentials

    console.log('Testing DEX connection for user...')

    // Test connection by attempting to authenticate
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

    if (!loginPageResponse.ok) {
      return new Response(JSON.stringify({
        success: false,
        error: `Unable to reach DEX platform at ${siteUrl}`
      }), { status: 200, headers: { 'Content-Type': 'application/json' } })
    }

    const cookies = loginPageResponse.headers.get('set-cookie')

    // Perform test login
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

    if (loginResponse.status === 302) {
      // Successful login - redirect indicates success
      return new Response(JSON.stringify({
        success: true,
        message: 'DEX credentials are valid and connection successful'
      }), { status: 200, headers: { 'Content-Type': 'application/json' } })
    } else {
      // Failed login
      return new Response(JSON.stringify({
        success: false,
        error: 'Invalid DEX credentials or authentication failed'
      }), { status: 200, headers: { 'Content-Type': 'application/json' } })
    }

  } catch (error) {
    console.error('Error testing DEX connection:', error)
    return new Response(JSON.stringify({
      success: false,
      error: 'Failed to test DEX connection: ' + error.message
    }), { status: 500, headers: { 'Content-Type': 'application/json' } })
  }
}
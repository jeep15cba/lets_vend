export const runtime = 'edge'

import { createClient } from '@supabase/supabase-js'

// Parse cookies from Edge Runtime request
function parseCookies(req) {
  const cookieHeader = req.headers.get('cookie') || ''
  const cookies = {}
  cookieHeader.split(';').forEach(cookie => {
    const [name, ...rest] = cookie.trim().split('=')
    if (name) {
      cookies[name] = rest.join('=')
    }
  })
  return cookies
}

export default async function handler(req) {
  console.log('🚀 update-order handler called, method:', req.method)

  if (req.method !== 'POST') {
    console.log('❌ Wrong method:', req.method)
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: {
        'Content-Type': 'application/json',
        'Allow': 'POST'
      }
    })
  }

  console.log('✅ Method is POST, proceeding...')

  try {
    // Parse cookies from request
    const cookies = parseCookies(req)
    console.log('🔧 Parsed cookies:', Object.keys(cookies))

    // Get auth tokens from cookies
    const authToken0 = cookies['sb-hkapfjibtaqmdpgxseuj-auth-token.0']
    const authToken1 = cookies['sb-hkapfjibtaqmdpgxseuj-auth-token.1']

    console.log('🔧 Auth tokens:', { has0: !!authToken0, has1: !!authToken1 })

    if (!authToken0 || !authToken1) {
      console.error('❌ Missing auth tokens in cookies')
      return new Response(JSON.stringify({
        error: 'Authentication required',
        details: 'No auth tokens found'
      }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      })
    }

    console.log('🔧 Attempting to decode token...')

    // Combine and decode the token
    const combinedToken = authToken0 + authToken1
    const decodedToken = JSON.parse(atob(combinedToken.replace('base64-', '')))
    const accessToken = decodedToken.access_token

    // Create Supabase client with access token
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      {
        global: {
          headers: {
            Authorization: `Bearer ${accessToken}`
          }
        }
      }
    )

    // Verify user is authenticated
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      console.error('Auth failed:', authError)
      return new Response(JSON.stringify({
        error: 'Authentication required',
        details: authError?.message || 'No user found'
      }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      })
    }

    const companyId = user.user_metadata?.company_id || user.app_metadata?.company_id
    console.log('✅ Auth successful for update-order:', { userId: user.id, companyId })

    const body = await req.json()
    const { machineOrders } = body

    if (!Array.isArray(machineOrders) || machineOrders.length === 0) {
      return new Response(JSON.stringify({ error: 'Invalid machineOrders array' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      })
    }

    // Update each machine's display_order
    const updatePromises = machineOrders.map(({ id, display_order }) => {
      return supabase
        .from('machines')
        .update({ display_order })
        .eq('id', id)
    })

    const results = await Promise.all(updatePromises)

    // Check for errors
    const errors = results.filter(r => r.error)
    if (errors.length > 0) {
      console.error('Errors updating machine orders:', errors)
      return new Response(JSON.stringify({
        error: 'Failed to update some machines',
        details: errors
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      })
    }

    return new Response(JSON.stringify({
      success: true,
      updated: machineOrders.length
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    })

  } catch (error) {
    console.error('Error updating machine orders:', error)
    return new Response(JSON.stringify({
      error: 'Internal server error',
      message: error.message
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    })
  }
}

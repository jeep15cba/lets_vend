import { createServerClient } from '@supabase/ssr'
import { NextResponse } from 'next/server'

export function createClient(request) {
  // For Edge Runtime, we need to parse cookies from headers
  // Edge Runtime API routes have req.cookies with _parsed and _headers properties
  if (request.cookies && request.cookies._parsed !== undefined) {
    // This is an Edge Runtime request - parse cookies from headers
    return createEdgeRuntimeClient(request)
  } else if (request.cookies && typeof request.cookies === 'object' && !request.cookies.get) {
    // This is a Pages Router API request (req object)
    return createPagesRouterClient(request)
  } else if (request.headers && typeof request.headers.get === 'function') {
    // This is a middleware request (NextRequest object)
    return createMiddlewareClient(request)
  } else {
    // Fallback - try to detect by headers
    return createEdgeRuntimeClient(request)
  }
}

// Parse cookies from Edge Runtime request headers
function parseCookies(req) {
  const cookieHeader = req.headers.get('cookie') || ''
  const cookies = {}
  const chunkedCookies = {}

  // First pass: collect all cookies including chunked ones
  cookieHeader.split(';').forEach(cookie => {
    const [name, ...rest] = cookie.trim().split('=')
    if (name) {
      let value = rest.join('=')

      // Check if this is a chunked cookie (e.g., cookie-name.0, cookie-name.1)
      const chunkMatch = name.match(/^(.+)\.(\d+)$/)
      if (chunkMatch) {
        const baseName = chunkMatch[1]
        const chunkIndex = parseInt(chunkMatch[2], 10)
        if (!chunkedCookies[baseName]) {
          chunkedCookies[baseName] = []
        }
        chunkedCookies[baseName][chunkIndex] = value
      } else {
        cookies[name] = value
      }
    }
  })

  // Second pass: reassemble chunked cookies
  Object.keys(chunkedCookies).forEach(baseName => {
    const chunks = chunkedCookies[baseName]
    let reassembled = chunks.filter(Boolean).join('')

    // Decode base64-encoded Supabase auth cookies
    if (reassembled && reassembled.startsWith('base64-')) {
      try {
        reassembled = Buffer.from(reassembled.substring(7), 'base64').toString('utf-8')
      } catch (e) {
        console.error('Failed to decode base64 cookie:', baseName, e.message)
      }
    }

    cookies[baseName] = reassembled
  })

  // Also decode non-chunked base64 cookies
  Object.keys(cookies).forEach(name => {
    let value = cookies[name]
    if (value && value.startsWith('base64-')) {
      try {
        cookies[name] = Buffer.from(value.substring(7), 'base64').toString('utf-8')
      } catch (e) {
        console.error('Failed to decode base64 cookie:', name, e.message)
      }
    }
  })

  return cookies
}

// For Edge Runtime API routes
function createEdgeRuntimeClient(req) {
  const cookies = parseCookies(req)
  console.log('🔧 createEdgeRuntimeClient - parsed cookies:', Object.keys(cookies))

  // Log the actual auth token cookie value (first 100 chars)
  const authTokenKey = Object.keys(cookies).find(k => k.includes('auth-token'))
  if (authTokenKey) {
    const tokenValue = cookies[authTokenKey]
    console.log('🔧 Auth token cookie value preview:', tokenValue?.substring(0, 100))
  }

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        get(name) {
          const value = cookies[name]
          if (name.includes('auth-token')) {
            console.log('🔧 Supabase requesting auth-token cookie:', name, 'found:', !!value)
          }
          return value
        },
        set(name, value, options) {
          // In Edge Runtime API routes, we can't modify cookies after response starts
          // This is handled by the response object in the API route
        },
        remove(name, options) {
          // In Edge Runtime API routes, we can't modify cookies after response starts
          // This is handled by the response object in the API route
        },
      },
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    }
  )

  return { supabase, response: null }
}

// For Pages Router API routes
function createPagesRouterClient(req) {
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        get(name) {
          return req.cookies[name]
        },
        set(name, value, options) {
          // In API routes, we can't modify cookies after response starts
          // This is handled by the response object in the API route
        },
        remove(name, options) {
          // In API routes, we can't modify cookies after response starts
          // This is handled by the response object in the API route
        },
      },
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    }
  )

  return { supabase, response: null }
}

// For middleware
function createMiddlewareClient(request) {
  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        get(name) {
          return request.cookies.get(name)?.value
        },
        set(name, value, options) {
          request.cookies.set({
            name,
            value,
            ...options,
          })
          response = NextResponse.next({
            request: {
              headers: request.headers,
            },
          })
          response.cookies.set({
            name,
            value,
            ...options,
          })
        },
        remove(name, options) {
          request.cookies.set({
            name,
            value: '',
            ...options,
          })
          response = NextResponse.next({
            request: {
              headers: request.headers,
            },
          })
          response.cookies.set({
            name,
            value: '',
            ...options,
          })
        },
      },
    }
  )

  return { supabase, response }
}

// For API routes that need authentication
export async function getAuthenticatedUser(req) {
  // Debug: Parse cookies for Edge Runtime
  let cookies = {}
  if (req.headers && typeof req.headers.get === 'function') {
    cookies = parseCookies(req)
  } else if (req.cookies) {
    cookies = req.cookies
  }

  console.log('🔧 getAuthenticatedUser - incoming cookies:', Object.keys(cookies))
  const authCookies = Object.keys(cookies).filter(name =>
    name.includes('sb-') || name.includes('supabase') || name.includes('auth')
  )
  console.log('🔧 getAuthenticatedUser - auth-related cookies:', authCookies)

  const { supabase } = createClient(req)

  try {
    const { data: { user }, error } = await supabase.auth.getUser()
    console.log('🔧 getAuthenticatedUser - user result:', !!user, user?.email, error?.message)

    if (error || !user) {
      return { user: null, error: error || 'No user found' }
    }

    return { user, error: null }
  } catch (error) {
    console.log('🔧 getAuthenticatedUser - exception:', error.message)
    return { user: null, error: error.message }
  }
}

// Get user's company context for RLS
export async function getUserCompanyContext(req) {
  const { user, error } = await getAuthenticatedUser(req)

  if (error || !user) {
    return { user: null, companyId: null, role: null, error }
  }

  // Extract company info from user metadata or JWT
  let companyId = user.user_metadata?.company_id || user.app_metadata?.company_id
  const role = user.user_metadata?.role || user.app_metadata?.role || 'user'

  // Check for impersonation header (admin only)
  const impersonatedCompanyId = req.headers.get('x-impersonate-company-id')
  if (impersonatedCompanyId && role === 'admin') {
    console.log(`🔧 Admin ${user.email} impersonating company: ${impersonatedCompanyId}`)
    companyId = impersonatedCompanyId
  }

  return {
    user,
    companyId,
    role,
    error: null
  }
}

// For fake auth scenarios - uses service role to bypass RLS
export function createServiceClient() {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_SERVICE

  if (!serviceKey) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY or NEXT_PUBLIC_SUPABASE_SERVICE is required for service client')
  }

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    serviceKey,
    {
      cookies: {
        get() { return undefined },
        set() {},
        remove() {},
      },
    }
  )

  return { supabase, response: null }
}
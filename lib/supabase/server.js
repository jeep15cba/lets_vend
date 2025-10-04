import { createServerClient } from '@supabase/ssr'
import { NextResponse } from 'next/server'

export function createClient(request) {
  // For Pages Router API routes, we need to handle the different structure
  // Pages Router: req.cookies is a plain object, not a method
  // Middleware: request.cookies has .get() method
  if (request.cookies && typeof request.cookies === 'object' && !request.cookies.get) {
    // This is a Pages Router API request (req object)
    return createPagesRouterClient(request)
  } else {
    // This is a middleware request (NextRequest object)
    return createMiddlewareClient(request)
  }
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
  // Debug: Log incoming cookies
  console.log('🔧 getAuthenticatedUser - incoming cookies:', Object.keys(req.cookies || {}))
  const authCookies = Object.keys(req.cookies || {}).filter(name =>
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
  const companyId = user.user_metadata?.company_id || user.app_metadata?.company_id
  const role = user.user_metadata?.role || user.app_metadata?.role || 'user'

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
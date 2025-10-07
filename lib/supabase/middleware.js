import { createServerClient } from '@supabase/ssr'
import { NextResponse } from 'next/server'

export async function updateSession(request) {
  // Skip auth for dev mode if Supabase not configured
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    console.log('🔧 DEV MODE: Skipping auth middleware - Supabase not configured')
    return NextResponse.next()
  }

  let supabaseResponse = NextResponse.next({
    request,
  })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          const cookies = request.cookies.getAll()
          // Debug: Log auth cookies
          const authCookies = cookies.filter(c => c.name.includes('sb-') || c.name.includes('supabase'))
          if (authCookies.length > 0) {
            console.log('🔧 Middleware found auth cookies:', authCookies.map(c => c.name))
          } else {
            console.log('🔧 Middleware: No auth cookies found')
          }
          return cookies
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({
            request,
          })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // IMPORTANT: Avoid writing any logic between createServerClient and
  // supabase.auth.getUser(). A simple mistake could make it very hard to debug
  // issues with users being randomly logged out.

  const {
    data: { user },
  } = await supabase.auth.getUser()

  // Debug: Log authentication state for API routes
  if (request.nextUrl.pathname.startsWith('/api/user/') || request.nextUrl.pathname.startsWith('/api/machines/')) {
    console.log('🔧 Middleware auth check for:', request.nextUrl.pathname)
    console.log('🔧 User authenticated:', !!user)
    if (user) {
      console.log('🔧 User ID:', user.id)
      console.log('🔧 User email:', user.email)
    } else {
      console.log('❌ NO USER FOUND in middleware for:', request.nextUrl.pathname)
    }
  }

  // TEMPORARY: Disable all redirects to prevent loops
  // // Protected routes that require authentication
  // if (request.nextUrl.pathname.startsWith('/dashboard')) {
  //   if (!user) {
  //     return NextResponse.redirect(new URL('/login', request.url))
  //   }
  // }

  // // Admin-only routes
  // if (request.nextUrl.pathname.startsWith('/admin')) {
  //   if (!user) {
  //     return NextResponse.redirect(new URL('/login', request.url))
  //   }

  //   const role = user.user_metadata?.role || user.app_metadata?.role
  //   if (role !== 'admin') {
  //     return NextResponse.redirect(new URL('/dashboard', request.url))
  //   }
  // }

  // API routes authentication
  if (request.nextUrl.pathname.startsWith('/api/') && !isPublicApi(request.nextUrl.pathname)) {
    // Check for service-level authentication (bypass user auth)
    const serviceKey = request.headers.get('X-Service-Key')
    const hasServiceAuth = serviceKey && serviceKey === process.env.SERVICE_API_KEY

    if (!user && !hasServiceAuth) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      )
    }
  }

  // TEMPORARY: Disable redirect logic to prevent loops
  // if (user && (request.nextUrl.pathname === '/login' || request.nextUrl.pathname === '/signup')) {
  //   return NextResponse.redirect(new URL('/dashboard', request.url))
  // }

  // IMPORTANT: You *must* return the supabaseResponse object as it is. If you're
  // creating a new response object with NextResponse.next() make sure to:
  // 1. Pass the request in it, like so: NextResponse.next({ request })
  // 2. Copy over the cookies, like so: response.cookies.setAll(supabaseResponse.cookies.getAll())
  // 3. Change the response's status code if needed, like so: response.status = 404

  return supabaseResponse
}

// Public API routes that don't require authentication
function isPublicApi(pathname) {
  const publicRoutes = [
    '/api/health',
    '/api/auth/signup', // User registration
    '/api/auth/login', // User login
    '/api/admin/user-info', // TEMPORARY: Get user info for company assignment
    '/api/admin/assign-company', // TEMPORARY: Assign company to user
    '/api/admin/fix-user-company', // TEMPORARY: Fix user company assignment
    '/api/admin/fix-user-app-metadata', // TEMPORARY: Fix user app metadata for RLS
    '/api/admin/create-user-credential', // TEMPORARY: Create user_credentials record for RLS
    '/api/admin/update-user-credentials', // TEMPORARY: Update user_credentials with encrypted values
    '/api/admin/re-encrypt-credentials', // TEMPORARY: Re-encrypt credentials with new encryption key
    '/api/test-comprehensive-dex', // TEMPORARY: Test comprehensive DEX approach
    '/api/debug-dex-page', // TEMPORARY: Debug DEX page HTML structure
    '/api/cantaloupe/devices-test', // TEMPORARY: Test devices endpoint
    '/api/test-device-capture-save', // TEMPORARY: Test device capture and save process
    '/api/test-dex-endpoint', // TEMPORARY: Test DEX endpoint strategies
    '/api/analyze-dex-page', // TEMPORARY: Analyze DEX page for AJAX endpoints
    '/api/test-dex-datatables', // TEMPORARY: Test DEX endpoint with DataTables format
    '/api/test-dex-minimal', // TEMPORARY: Test DEX endpoint with minimal format
    '/api/cantaloupe/dex-raw', // TEMPORARY: Test existing DEX raw endpoint
    '/api/dex/capture', // TEMPORARY: Test DEX capture and save process
    '/api/dex/list-only', // TEMPORARY: Test DEX list only endpoint
    '/api/dex/test-getRawDex', // TEMPORARY: Test getRawDex endpoint approaches
    '/api/dex/update-4hr-flags', // Service-only: Update 4-hour DEX flags
    // '/api/dex/collect-bulk', // REMOVED: Must use proper Supabase AUTH/RLS
    // Removed temporary public access - these now require authentication
    '/api/machines/summary', // Public summary for now
    '/api/machines/supabase-demo', // Demo endpoint
    '/api/machines/update-order', // TEMPORARY: Handles auth internally via Edge Runtime
    '/api/machines/import-update', // TEMPORARY: Handles auth internally via Edge Runtime
    '/api/devices/', // TEMPORARY: Device update endpoint - handles auth internally via Edge Runtime
  ]

  const isPublic = publicRoutes.some(route => pathname.startsWith(route))

  // Debug logging
  if (pathname.includes('collect-bulk')) {
    console.log('🔧 Debug collect-bulk middleware check:', {
      pathname,
      isPublic,
      matchingRoutes: publicRoutes.filter(route => pathname.startsWith(route))
    })
  }

  return isPublic
}
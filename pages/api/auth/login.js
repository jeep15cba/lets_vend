import { createServiceClient } from '../../../lib/supabase/server'
export const runtime = 'edge'

export default async function handler(req) {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: { 'Content-Type': 'application/json' } })
  }

  const { email, password } = await req.json()

  if (!email || !password) {
    return new Response(JSON.stringify({ error: 'Email and password are required' }), { status: 400, headers: { 'Content-Type': 'application/json' } })
  }

  try {
    const { supabase } = createServiceClient()

    // Sign in with email and password
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password
    })

    if (error) {
      console.error('Login error:', error)
      return new Response(JSON.stringify({ error: error.message }), { status: 401, headers: { 'Content-Type': 'application/json' } })
    }

    if (!data.user) {
      return new Response(JSON.stringify({ error: 'Invalid credentials' }), { status: 401, headers: { 'Content-Type': 'application/json' } })
    }

    console.log('✅ User login successful:', {
      userId: data.user.id,
      email: data.user.email
    })

    // Set auth cookies manually (for server-side session management)
    const headers = { 'Content-Type': 'application/json' }
    if (data.session) {
      headers['Set-Cookie'] = [
        `sb-hkapfjibtaqmdpgxseuj-auth-token=${data.session.access_token}; HttpOnly; Path=/; Max-Age=3600; SameSite=Lax`,
        `sb-hkapfjibtaqmdpgxseuj-auth-token-code-verifier=${data.session.refresh_token}; HttpOnly; Path=/; Max-Age=86400; SameSite=Lax`
      ].join(', ')
    }

    return new Response(JSON.stringify({
      success: true,
      user: data.user,
      session: data.session,
      message: 'Login successful'
    }), { status: 200, headers })

  } catch (error) {
    console.error('Login error:', error)
    return new Response(JSON.stringify({ error: 'Internal server error' }), { status: 500, headers: { 'Content-Type': 'application/json' } })
  }
}
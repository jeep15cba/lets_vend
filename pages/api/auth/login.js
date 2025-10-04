import { createServiceClient } from '../../../lib/supabase/server'
export const runtime = 'edge'

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { email, password } = req.body

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' })
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
      return res.status(401).json({ error: error.message })
    }

    if (!data.user) {
      return res.status(401).json({ error: 'Invalid credentials' })
    }

    // Set auth cookies manually (for server-side session management)
    if (data.session) {
      res.setHeader('Set-Cookie', [
        `sb-hkapfjibtaqmdpgxseuj-auth-token=${data.session.access_token}; HttpOnly; Path=/; Max-Age=3600; SameSite=Lax`,
        `sb-hkapfjibtaqmdpgxseuj-auth-token-code-verifier=${data.session.refresh_token}; HttpOnly; Path=/; Max-Age=86400; SameSite=Lax`
      ])
    }

    console.log('✅ User login successful:', {
      userId: data.user.id,
      email: data.user.email
    })

    return res.status(200).json({
      success: true,
      user: data.user,
      session: data.session,
      message: 'Login successful'
    })

  } catch (error) {
    console.error('Login error:', error)
    return res.status(500).json({ error: 'Internal server error' })
  }
}
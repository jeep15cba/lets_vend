import { createBrowserClient } from '@supabase/ssr'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

console.log('🔧 Supabase Client Setup:')
console.log('🔧 URL:', supabaseUrl ? 'SET' : 'NOT SET')
console.log('🔧 ANON_KEY:', supabaseAnonKey ? 'SET' : 'NOT SET')

// Create a mock client for dev mode when Supabase is not configured
let supabase = null

if (supabaseUrl && supabaseAnonKey) {
  console.log('🔧 Creating real Supabase browser client with cookies')
  supabase = createBrowserClient(supabaseUrl, supabaseAnonKey)
} else {
  console.log('🔧 DEV MODE: Supabase client not configured - using mock client')
  // Create a minimal mock client that won't break in dev mode
  supabase = {
    auth: {
      getSession: () => Promise.resolve({ data: { session: null }, error: null }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
      signInWithPassword: () => Promise.resolve({ data: { user: null }, error: new Error('Dev mode') }),
      signUp: () => Promise.resolve({ data: { user: null }, error: new Error('Dev mode') }),
      signOut: () => Promise.resolve({ error: null }),
      resetPasswordForEmail: () => Promise.resolve({ error: null }),
      updateUser: () => Promise.resolve({ error: null })
    }
  }
}

export { supabase }
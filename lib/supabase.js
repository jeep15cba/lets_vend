import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

// Only create client if both URL and key are provided and valid
let supabase = null

if (supabaseUrl && supabaseAnonKey && supabaseUrl !== 'https://your-project-ref.supabase.co' && supabaseAnonKey !== 'your_supabase_anon_key_here') {
  try {
    supabase = createClient(supabaseUrl, supabaseAnonKey)
    console.log('✅ Supabase client initialized')
  } catch (error) {
    console.error('❌ Failed to create Supabase client:', error)
    supabase = null
  }
} else {
  console.log('🔧 DEV MODE: Supabase not configured - using fake auth')
}

export { supabase }
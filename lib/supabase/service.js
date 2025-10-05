import { createClient } from '@supabase/supabase-js'

/**
 * Creates a Supabase client with SERVICE ROLE key
 * WARNING: This bypasses ALL Row Level Security (RLS) policies
 * Only use this for:
 * - Scheduled/automated tasks that need to access all data
 * - Server-side operations that require elevated permissions
 * - Admin operations
 *
 * NEVER expose this client to the frontend or user-facing code
 */
export function createServiceClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl) {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL environment variable')
  }

  if (!supabaseServiceKey) {
    throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY environment variable')
  }

  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  })
}

/**
 * Validates service-level authentication
 * Checks if the request includes valid service credentials
 */
export function validateServiceAuth(req) {
  const serviceKey = req.headers.get('X-Service-Key')
  const companyId = req.headers.get('X-Company-ID')

  const expectedKey = process.env.SERVICE_API_KEY

  if (!expectedKey) {
    throw new Error('SERVICE_API_KEY not configured')
  }

  if (!serviceKey || serviceKey !== expectedKey) {
    return { valid: false, error: 'Invalid or missing service key' }
  }

  if (!companyId) {
    return { valid: false, error: 'Missing X-Company-ID header' }
  }

  return { valid: true, companyId }
}

import { getUserCompanyContext, createServiceClient } from '../../lib/supabase/server'
export const runtime = 'edge'

export default async function handler(req) {
  try {
    // Test getUserCompanyContext
    const { user, companyId, role, error: authError } = await getUserCompanyContext(req)

    if (authError || !user) {
      return new Response(JSON.stringify({
        error: 'Authentication required',
        authError: authError?.message || 'No user'
      }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      })
    }

    // Test createServiceClient
    const { supabase } = createServiceClient()

    return new Response(JSON.stringify({
      success: true,
      message: 'Supabase functions work!',
      userId: user.id,
      companyId,
      role
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    })

  } catch (error) {
    return new Response(JSON.stringify({
      error: 'Test failed',
      message: error.message,
      stack: error.stack
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    })
  }
}

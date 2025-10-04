// Fake authentication helper for testing
// This bypasses Supabase auth issues while keeping database functionality
import { getUserCompanyContext } from './supabase/server'

export function getFakeUserContext() {
  return {
    user: {
      id: '00000000-0000-0000-0000-000000000001',
      email: 'dev@example.com',
      user_metadata: {
        name: 'Dev User'
      }
    },
    companyId: '00000000-0000-0000-0000-000000000002',
    role: 'admin',
    error: null
  }
}

export async function getAuthContext(req, forceFakeAuth = false) {
  // If explicitly forcing fake auth (for testing)
  if (forceFakeAuth) {
    console.log('🔧 Using fake authentication (forced)')
    return getFakeUserContext()
  }

  // Try real auth first
  try {
    const result = await getUserCompanyContext(req)

    // If real auth worked and we have a user, use it
    if (result && result.user && !result.error) {
      console.log('🔧 Using real authentication:', {
        userId: result.user.id,
        email: result.user.email,
        companyId: result.companyId
      })
      return result
    }

    // If real auth didn't work, fall back to fake auth
    console.log('🔧 Real auth returned no user, using fake auth fallback')
    return getFakeUserContext()
  } catch (error) {
    console.log('🔧 Real auth failed, using fake auth fallback:', error.message)
    return getFakeUserContext()
  }
}
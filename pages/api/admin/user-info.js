import { getUserCompanyContext } from '../../../lib/supabase/server'

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const { user, companyId, role, error: authError } = await getUserCompanyContext(req)

    if (!user || authError) {
      return res.status(401).json({
        error: 'Authentication required',
        details: authError?.message || 'No user session found'
      })
    }

    return res.status(200).json({
      user: {
        id: user.id,
        email: user.email,
        user_metadata: user.user_metadata,
        app_metadata: user.app_metadata
      },
      companyId,
      role,
      rawUserData: user
    })

  } catch (error) {
    console.error('User info API error:', error)
    return res.status(500).json({ error: 'Internal server error' })
  }
}
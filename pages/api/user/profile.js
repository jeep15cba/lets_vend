import { getUserCompanyContext } from '../../../lib/supabase/server'
export const runtime = 'edge'

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const { user, companyId, role, error: authError } = await getUserCompanyContext(req)

    if (!user || authError) {
      return res.status(401).json({ error: 'Authentication required' })
    }

    console.log('🔧 Profile API - User ID:', user.id)
    console.log('🔧 Profile API - User metadata:', JSON.stringify(user.user_metadata))
    console.log('🔧 Profile API - Company ID:', companyId)

    // Fetch company information from database
    let companyName = ''
    if (companyId) {
      try {
        // Use authenticated client with proper RLS
        const { createClient } = require('../../../lib/supabase/server')
        const { supabase } = createClient(req)

        console.log('🔧 Profile API: Querying company with ID:', companyId)

        // First, check if user has a record in user_credentials table
        const { data: userCreds, error: userCredsError } = await supabase
          .from('user_credentials')
          .select('company_id')
          .eq('user_id', user.id)
          .single()

        console.log('🔧 Profile API: User credentials record:', userCreds ? 'EXISTS' : 'MISSING')
        console.log('🔧 Profile API: User credentials company_id:', userCreds?.company_id)
        if (userCredsError) {
          console.log('🔧 Profile API: User credentials error:', userCredsError.message)
        }

        const { data: company, error: companyError } = await supabase
          .from('companies')
          .select('company_name')
          .eq('id', companyId)
          .single()

        if (company && !companyError) {
          companyName = company.company_name
          console.log('🔧 Profile API: Successfully found company name:', companyName)
        } else {
          console.warn('🔧 Profile API: RLS blocked company lookup - company_id not in JWT app_metadata:', companyError?.message)
          console.warn('🔧 Profile API: Current user_metadata has company_id:', user.user_metadata?.company_id)
          console.warn('🔧 Profile API: Current app_metadata has company_id:', user.app_metadata?.company_id)
        }
      } catch (error) {
        console.warn('🔧 Profile API: Error fetching company:', error.message)
      }
    }

    return res.status(200).json({
      user: {
        id: user.id,
        email: user.email,
        user_metadata: {
          name: user.user_metadata?.name,
          company_id: companyId,
          company_name: companyName,
          role: role
        }
      },
      companyId,
      companyName,
      role
    })

  } catch (error) {
    console.error('Profile API error:', error)
    return res.status(500).json({ error: 'Internal server error' })
  }
}
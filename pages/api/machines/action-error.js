import { getUserCompanyContext, createClient } from '../../../lib/supabase/server'
export const runtime = 'edge'

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const { user, companyId, error: authError } = await getUserCompanyContext(req)

    if (authError || !user) {
      return res.status(401).json({ error: 'Authentication required' })
    }

    const { machineId, errorCode, errorTimestamp, actioned } = req.body

    if (!machineId || !errorCode || !errorTimestamp) {
      return res.status(400).json({ error: 'Missing required fields' })
    }

    // Use authenticated client instead of service client - RLS will handle authorization
    const { supabase } = createClient(req)

    // Get the machine
    const { data: machine, error: fetchError } = await supabase
      .from('machines')
      .select('latest_errors, company_id')
      .eq('id', machineId)
      .single()

    if (fetchError) throw fetchError

    // Verify the machine belongs to the user's company
    if (machine.company_id !== companyId) {
      return res.status(403).json({ error: 'Unauthorized access to this machine' })
    }

    // Update the error's actioned status
    const updatedErrors = (machine.latest_errors || []).map(error => {
      if (error.code === errorCode && error.timestamp === errorTimestamp) {
        return {
          ...error,
          actioned: actioned,
          actioned_at: actioned ? new Date().toISOString() : null
        }
      }
      return error
    })

    // Save back to database
    const { error: updateError } = await supabase
      .from('machines')
      .update({
        latest_errors: updatedErrors,
        updated_at: new Date().toISOString()
      })
      .eq('id', machineId)

    if (updateError) throw updateError

    return res.status(200).json({
      success: true,
      message: 'Error status updated'
    })

  } catch (error) {
    console.error('Error updating error status:', error)
    return res.status(500).json({ error: 'Internal server error' })
  }
}

import { getUserCompanyContext, createClient } from '../../../lib/supabase/server'
export const runtime = 'edge'

export default async function handler(req) {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: { 'Content-Type': 'application/json' } })
  }

  try {
    const { user, companyId, error: authError } = await getUserCompanyContext(req)

    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Authentication required' }), { status: 401, headers: { 'Content-Type': 'application/json' } })
    }

    const { machineId, errorCode, errorTimestamp, actioned } = await req.json()

    if (!machineId || !errorCode || !errorTimestamp) {
      return new Response(JSON.stringify({ error: 'Missing required fields' }), { status: 400, headers: { 'Content-Type': 'application/json' } })
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
      return new Response(JSON.stringify({ error: 'Unauthorized access to this machine' }), { status: 403, headers: { 'Content-Type': 'application/json' } })
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

    return new Response(JSON.stringify({
      success: true,
      message: 'Error status updated'
    }), { status: 200, headers: { 'Content-Type': 'application/json' } })

  } catch (error) {
    console.error('Error updating error status:', error)
    return new Response(JSON.stringify({ error: 'Internal server error' }), { status: 500, headers: { 'Content-Type': 'application/json' } })
  }
}

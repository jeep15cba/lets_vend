import { supabase } from '../../../lib/supabase'

export const runtime = 'edge';


export default async function handler(req, res) {
  const { method } = req

  switch (method) {
    case 'GET':
      try {
        const { machine_id, limit = 50 } = req.query

        let query = supabase
          .from('dex_logs')
          .select(`
            *,
            machines (machine_id, name, location)
          `)
          .order('created_at', { ascending: false })
          .limit(parseInt(limit))

        if (machine_id) {
          // Look up machine by machine_id and get the UUID
          const { data: machines } = await supabase
            .from('machines')
            .select('id')
            .eq('machine_id', machine_id)

          if (machines && machines.length > 0) {
            query = query.eq('machine_id', machines[0].id)
          }
        }

        const { data: logs, error } = await query

        if (error) throw error

        res.status(200).json({ logs })
      } catch (error) {
        res.status(500).json({ error: error.message })
      }
      break

    case 'POST':
      try {
        const { machine_id, raw_data, status = 'success', error_message } = req.body

        // Validate required fields
        if (!machine_id || !raw_data) {
          return res.status(400).json({ error: 'machine_id and raw_data are required' })
        }

        // Look up machine by machine_id to get the UUID
        const { data: machines, error: machineError } = await supabase
          .from('machines')
          .select('id')
          .eq('machine_id', machine_id)

        if (machineError) throw machineError

        if (!machines || machines.length === 0) {
          return res.status(404).json({ error: 'Machine not found' })
        }

        const { data: log, error } = await supabase
          .from('dex_logs')
          .insert([{
            machine_id: machines[0].id,
            raw_data,
            data_size: raw_data.length,
            status,
            error_message,
            user_id: req.user?.id // This will need to be set by auth middleware
          }])
          .select()
          .single()

        if (error) throw error

        res.status(201).json({ log })
      } catch (error) {
        res.status(500).json({ error: error.message })
      }
      break

    default:
      res.setHeader('Allow', ['GET', 'POST'])
      res.status(405).end(`Method ${method} Not Allowed`)
  }
}
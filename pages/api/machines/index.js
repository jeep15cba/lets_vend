import { supabase } from '../../../lib/supabase'

export default async function handler(req, res) {
  const { method } = req

  switch (method) {
    case 'GET':
      try {
        const { data: machines, error } = await supabase
          .from('machines')
          .select('*')
          .order('created_at', { ascending: false })

        if (error) throw error

        res.status(200).json({ machines })
      } catch (error) {
        res.status(500).json({ error: error.message })
      }
      break

    case 'POST':
      try {
        const { machine_id, name, location, description } = req.body

        // Validate required fields
        if (!machine_id || !name) {
          return res.status(400).json({ error: 'machine_id and name are required' })
        }

        const { data: machine, error } = await supabase
          .from('machines')
          .insert([{
            machine_id,
            name,
            location,
            description,
            user_id: req.user?.id // This will need to be set by auth middleware
          }])
          .select()
          .single()

        if (error) throw error

        res.status(201).json({ machine })
      } catch (error) {
        res.status(500).json({ error: error.message })
      }
      break

    default:
      res.setHeader('Allow', ['GET', 'POST'])
      res.status(405).end(`Method ${method} Not Allowed`)
  }
}
#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://hkapfjibtaqmdpgxseuj.supabase.co'
const serviceRoleKey = 'sb_secret_ccodFj85O--RdZlibrDmuQ_m6cDt3FB'

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
})

async function fixMachineTypes() {
  console.log('🔧 Starting machine_type fix...')

  try {
    // Update all 'snack' values to 'food'
    const { data, error } = await supabase
      .from('machines')
      .update({ machine_type: 'food' })
      .eq('machine_type', 'snack')
      .select()

    if (error) {
      console.error('❌ Error:', error)
      process.exit(1)
    }

    console.log(`✅ Updated ${data?.length || 0} machines from 'snack' to 'food'`)
    console.log('✅ Done! You can now import your CSV.')
  } catch (error) {
    console.error('❌ Error:', error.message)
    process.exit(1)
  }
}

fixMachineTypes()

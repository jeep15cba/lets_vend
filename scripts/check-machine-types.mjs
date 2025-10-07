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

async function checkMachineTypes() {
  console.log('🔍 Checking machine_type distribution...')

  try {
    // Get all machines
    const { data, error } = await supabase
      .from('machines')
      .select('id, case_serial, machine_type')
      .limit(100)

    if (error) {
      console.error('❌ Error:', error)
      process.exit(1)
    }

    const typeCounts = {}
    data.forEach(machine => {
      const type = machine.machine_type || 'null'
      typeCounts[type] = (typeCounts[type] || 0) + 1
    })

    console.log('\n📊 Machine type distribution (first 100 machines):')
    Object.entries(typeCounts).forEach(([type, count]) => {
      console.log(`  ${type}: ${count}`)
    })

    // Show first few 'snack' machines if any
    const snackMachines = data.filter(m => m.machine_type === 'snack')
    if (snackMachines.length > 0) {
      console.log(`\n🍿 Found ${snackMachines.length} 'snack' machines:`)
      snackMachines.slice(0, 3).forEach(m => {
        console.log(`  - ${m.case_serial} (${m.id})`)
      })
    }

  } catch (error) {
    console.error('❌ Error:', error.message)
    process.exit(1)
  }
}

checkMachineTypes()

// One-time script to mass update machine types and models in Supabase
const { createClient } = require('@supabase/supabase-js')
const fs = require('fs')
const path = require('path')

// Load environment variables from .env.local
const envPath = path.join(__dirname, '..', '.env.local')
const envContent = fs.readFileSync(envPath, 'utf8')
envContent.split('\n').forEach(line => {
  const match = line.match(/^([^=]+)=(.*)$/)
  if (match) {
    process.env[match[1]] = match[2]
  }
})

const deviceMachineTypes = require('../data/machine-types-mapping')
const comprehensiveDexData = require('../data/comprehensive-dex-data.json')

async function updateMachineTypes() {
  // Create Supabase client with service role key (bypasses RLS)
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_SERVICE

  if (!supabaseUrl || !supabaseKey) {
    console.error('Missing Supabase credentials in .env.local')
    console.error('Required: NEXT_PUBLIC_SUPABASE_URL and (SUPABASE_SERVICE_ROLE_KEY or NEXT_PUBLIC_SUPABASE_SERVICE)')
    process.exit(1)
  }

  console.log('Using Supabase URL:', supabaseUrl)
  console.log('Using service role key:', supabaseKey.substring(0, 20) + '...')

  const supabase = createClient(supabaseUrl, supabaseKey)

  console.log('Fetching machines from Supabase...')

  // Filter by specific company_id
  const targetCompanyId = 'a16496ce-fa1f-45f6-a7b8-5cb01d4d9be7'
  console.log(`Filtering for company_id: ${targetCompanyId}`)

  // Get all machines from the database for this company (ordered by id for consistent ordering)
  const { data: machines, error: fetchError } = await supabase
    .from('machines')
    .select('id, case_serial, machine_type, machine_model, cash_enabled, status, company_id, display_order')
    .eq('company_id', targetCompanyId)
    .order('id', { ascending: true })

  if (fetchError) {
    console.error('Error fetching machines:', fetchError)
    process.exit(1)
  }

  console.log(`Found ${machines.length} machines in database`)

  const updates = []
  const skipped = []

  // Process each machine
  let displayOrder = 1
  for (const machine of machines) {
    const mapping = deviceMachineTypes[machine.case_serial]
    const dexData = comprehensiveDexData.results[machine.case_serial]

    const updateData = {}
    let needsUpdate = false

    // Update machine type and model from mapping
    if (mapping) {
      const machineType = mapping.type === 'bev' ? 'beverage' : mapping.type

      if (machine.machine_type !== machineType) {
        updateData.machine_type = machineType
        needsUpdate = true
      }

      if (machine.machine_model !== mapping.model) {
        updateData.machine_model = mapping.model
        needsUpdate = true
      }
    }

    // Update cash_enabled and status from comprehensive DEX data
    if (dexData && dexData.machineDetails) {
      const cashEnabled = dexData.machineDetails.cashEnabled
      const status = dexData.machineDetails.status

      if (cashEnabled !== undefined && machine.cash_enabled !== cashEnabled) {
        updateData.cash_enabled = cashEnabled
        needsUpdate = true
      }

      if (status && machine.status !== status) {
        updateData.status = status
        needsUpdate = true
      }
    }

    // Always update display_order to ensure sequential ordering
    if (machine.display_order !== displayOrder) {
      updateData.display_order = displayOrder
      needsUpdate = true
    }

    // Check if update is needed
    if (needsUpdate) {
      console.log(`Updating ${machine.case_serial}:`, updateData)

      updates.push({
        case_serial: machine.case_serial,
        old: {
          type: machine.machine_type,
          model: machine.machine_model,
          cash_enabled: machine.cash_enabled,
          status: machine.status,
          display_order: machine.display_order
        },
        new: {
          type: updateData.machine_type || machine.machine_type,
          model: updateData.machine_model || machine.machine_model,
          cash_enabled: updateData.cash_enabled !== undefined ? updateData.cash_enabled : machine.cash_enabled,
          status: updateData.status || machine.status,
          display_order: updateData.display_order || machine.display_order
        }
      })

      // Update the machine in Supabase
      const { error: updateError } = await supabase
        .from('machines')
        .update(updateData)
        .eq('id', machine.id)

      if (updateError) {
        console.error(`Error updating machine ${machine.case_serial}:`, updateError)
      }
    } else {
      console.log(`Skipping ${machine.case_serial}: already up to date`)
    }

    // Increment display_order for next machine
    displayOrder++
  }

  console.log('\n=== Update Summary ===')
  console.log(`Total machines: ${machines.length}`)
  console.log(`Updated: ${updates.length}`)
  console.log(`Skipped: ${skipped.length}`)

  if (updates.length > 0) {
    console.log('\n=== Updated Machines ===')
    updates.forEach(u => {
      const changes = []
      if (u.old.type !== u.new.type) changes.push(`type: ${u.old.type || 'null'} → ${u.new.type}`)
      if (u.old.model !== u.new.model) changes.push(`model: ${u.old.model || 'null'} → ${u.new.model}`)
      if (u.old.cash_enabled !== u.new.cash_enabled) changes.push(`cash_enabled: ${u.old.cash_enabled} → ${u.new.cash_enabled}`)
      if (u.old.status !== u.new.status) changes.push(`status: ${u.old.status} → ${u.new.status}`)
      if (u.old.display_order !== u.new.display_order) changes.push(`display_order: ${u.old.display_order || 'null'} → ${u.new.display_order}`)
      console.log(`${u.case_serial}: ${changes.join(', ')}`)
    })
  }

  if (skipped.length > 0) {
    console.log('\n=== Skipped Machines ===')
    skipped.forEach(s => {
      console.log(`${s.case_serial}: ${s.reason}`)
    })
  }
}

updateMachineTypes().catch(console.error)
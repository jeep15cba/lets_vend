const fs = require('fs');
const path = require('path');

// Cash-enabled machines (those with "CASH MACHINE" in Place field)
const cashMachines = [
  '552234133189', // North West Hospital - "Entrance Hallway - CASH MACHINE"
  '552234133306', // Isawash Laundromat - "Laundromat - CASH MACHINE"
  '552234133200', // JDR Mining and Civil - "Cribroom - CASH MACHINE"
  '552234133195', // Mount Isa Courthouse - "Foyer - CASH MACHINE"
  'CSA200205378', // JJ's Waste & Recycling - "Behind Main Building Near Cribroom - CASH MACHINE"
  '552234133196', // Library - "Library - CASH MACHINE"
  '552234133194', // Queensland Rail - "Foyer - CASH MACHINE"
  '552234133191', // Jimaylya Topsy Harry Center - "TV Room - CASH MACHINE"
  '552234133192', // Arthur Peterson Diversionary Centre - "Main Building - CASH MACHINE"
  'CSA200205534'  // Kabalulumana Hostel - "Reception - CASH MACHINE"
];

function updateCashEnabled() {
  try {
    // Read the current mapping file
    const mappingPath = path.join(__dirname, '..', 'data', 'case-serial-dex-mapping.json');
    const mappingData = JSON.parse(fs.readFileSync(mappingPath, 'utf8'));

    let updatedCount = 0;
    let totalCashMachines = 0;

    // Update each cash machine with cashEnabled flag
    for (const [caseSerial, dexRecords] of Object.entries(mappingData.mappings)) {
      const isCashMachine = cashMachines.includes(caseSerial);

      if (isCashMachine) {
        totalCashMachines++;

        // Update each DEX record in the array with cashEnabled flag
        for (const record of dexRecords) {
          if (record.cashEnabled === undefined) {
            record.cashEnabled = true;
            updatedCount++;
          }
        }
      } else {
        // Set cashEnabled to false for non-cash machines
        for (const record of dexRecords) {
          if (record.cashEnabled === undefined) {
            record.cashEnabled = false;
          }
        }
      }
    }

    // Update the file metadata
    mappingData.lastCashEnabledUpdate = new Date().toISOString();
    mappingData.cashEnabledNote = "cashEnabled flag added: true for machines with 'CASH MACHINE' in Place field, false for others. CA17 field indicates cash handling capabilities.";

    // Write the updated file back
    fs.writeFileSync(mappingPath, JSON.stringify(mappingData, null, 2));

    console.log(`✅ Cash enabled flags update completed:`);
    console.log(`   - Total cash machines identified: ${totalCashMachines}`);
    console.log(`   - Records updated with cashEnabled=true: ${updatedCount}`);
    console.log(`   - Cash machines list: ${cashMachines.join(', ')}`);

    // Show cash machine breakdown by type
    const cashBevCount = cashMachines.filter(serial => {
      const record = mappingData.mappings[serial];
      return record && record[0] && record[0].machineType === 'bev';
    }).length;

    const cashFoodCount = cashMachines.filter(serial => {
      const record = mappingData.mappings[serial];
      return record && record[0] && record[0].machineType === 'food';
    }).length;

    console.log(`   - Cash beverage machines: ${cashBevCount}`);
    console.log(`   - Cash food machines: ${cashFoodCount}`);

  } catch (error) {
    console.error('❌ Error updating cash enabled flags:', error.message);
    process.exit(1);
  }
}

updateCashEnabled();
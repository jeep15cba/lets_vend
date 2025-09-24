const fs = require('fs');
const path = require('path');

function restructureMappingFile() {
  try {
    // Read current mapping file
    const currentFile = path.join(__dirname, '..', 'public', 'data', 'case-serial-dex-mapping.json');
    const currentData = JSON.parse(fs.readFileSync(currentFile, 'utf8'));

    // Create new structure
    const newStructure = {
      timestamp: new Date().toISOString(),
      note: "Restructured case serial mapping with separate machine details and DEX data",
      source: "Live data from https://dashboard.cantaloupe.online/dex API",
      format: "Each case serial has 'details' (static machine info) and 'dex' (dynamic DEX records)",
      machines: {}
    };

    // Process each case serial
    for (const [caseSerial, records] of Object.entries(currentData.mappings)) {
      const latestRecord = records[0]; // Most recent record

      // Extract static machine details (won't change often)
      const details = {
        machineType: latestRecord.machineType || 'unknown',
        machineModel: latestRecord.machineModel || 'Unknown Model',
        machineLocation: latestRecord.machineLocation || 'Unknown Location',
        cashEnabled: latestRecord.cashEnabled || false,
        status: 'active', // Default status, can be updated based on errors
        lastUpdated: latestRecord.timestamp || new Date().toISOString()
      };

      // Extract dynamic DEX data (changes with each fetch)
      const dexRecords = records.map(record => ({
        dexId: record.dexId,
        timestamp: record.timestamp,
        firmware: record.firmware,
        parsed: record.parsed,
        status: record.status || null,
        note: record.note || null
      })).filter(record => record.dexId !== null); // Remove null DEX IDs

      // Create new structure for this machine
      newStructure.machines[caseSerial] = {
        details: details,
        dex: dexRecords
      };
    }

    // Write new structure
    const outputFile = path.join(__dirname, '..', 'public', 'data', 'case-serial-dex-mapping-new.json');
    fs.writeFileSync(outputFile, JSON.stringify(newStructure, null, 2));

    console.log('✅ Restructured mapping file created successfully');
    console.log(`   - Total machines: ${Object.keys(newStructure.machines).length}`);

    // Show sample of new structure
    const sampleKey = Object.keys(newStructure.machines)[0];
    console.log(`   - Sample structure for ${sampleKey}:`);
    console.log(JSON.stringify(newStructure.machines[sampleKey], null, 4));

    // Statistics
    const withDex = Object.values(newStructure.machines).filter(m => m.dex.length > 0).length;
    const bevMachines = Object.values(newStructure.machines).filter(m => m.details.machineType === 'bev').length;
    const foodMachines = Object.values(newStructure.machines).filter(m => m.details.machineType === 'food').length;
    const cashEnabled = Object.values(newStructure.machines).filter(m => m.details.cashEnabled === true).length;

    console.log(`   - Machines with DEX data: ${withDex}`);
    console.log(`   - Beverage machines: ${bevMachines}`);
    console.log(`   - Food machines: ${foodMachines}`);
    console.log(`   - Cash enabled: ${cashEnabled}`);

  } catch (error) {
    console.error('❌ Error restructuring mapping file:', error.message);
    process.exit(1);
  }
}

restructureMappingFile();
const fs = require('fs');
const path = require('path');

async function updateMappingWithLiveDex() {
  try {
    console.log('🔄 Updating case-serial-dex-mapping-new.json with live DEX data...');

    // Load the current mapping file
    const mappingFile = path.join(__dirname, '..', 'public', 'data', 'case-serial-dex-mapping-new.json');
    const mappingData = JSON.parse(fs.readFileSync(mappingFile, 'utf8'));

    // Load the live DEX mapping we created
    const liveMappingFile = path.join(__dirname, '..', 'data', 'live-case-serial-dex-mapping.json');
    const liveMappingData = JSON.parse(fs.readFileSync(liveMappingFile, 'utf8'));

    let updatedCount = 0;
    let alreadyHadDexCount = 0;
    let noLiveDexCount = 0;

    console.log(`📊 Processing ${Object.keys(mappingData.machines).length} machines...`);

    // Update each machine with live DEX data if available
    Object.keys(mappingData.machines).forEach(caseSerial => {
      const machine = mappingData.machines[caseSerial];
      const liveDexInfo = liveMappingData.mapping[caseSerial];

      if (machine.dex && machine.dex.length > 0) {
        // Machine already has DEX data
        alreadyHadDexCount++;
        console.log(`  ✅ ${caseSerial}: Already has ${machine.dex.length} DEX record(s)`);
      } else if (liveDexInfo && liveDexInfo.dexId) {
        // Machine has no DEX data but we found live DEX info
        machine.dex = [{
          dexId: liveDexInfo.dexId,
          timestamp: new Date(liveDexInfo.timestamp).toISOString(),
          firmware: liveDexInfo.firmware,
          parsed: liveDexInfo.parsed,
          status: null,
          note: "Added from live DEX mapping"
        }];

        // Update the lastUpdated timestamp
        machine.details.lastUpdated = new Date().toISOString();

        updatedCount++;
        console.log(`  🆕 ${caseSerial}: Added DEX ID ${liveDexInfo.dexId} (${liveDexInfo.firmware})`);
      } else {
        // No live DEX data found
        noLiveDexCount++;
        console.log(`  ⚠️  ${caseSerial}: No live DEX data found`);
      }
    });

    // Update metadata
    mappingData.timestamp = new Date().toISOString();
    mappingData.note = "Complete mapping with all devices and updated with live DEX data";

    // Save updated mapping
    fs.writeFileSync(mappingFile, JSON.stringify(mappingData, null, 2));

    console.log('\n🎉 Mapping update completed!');
    console.log(`📊 Summary:`);
    console.log(`   - Machines that already had DEX data: ${alreadyHadDexCount}`);
    console.log(`   - Machines updated with new DEX data: ${updatedCount}`);
    console.log(`   - Machines with no live DEX data: ${noLiveDexCount}`);
    console.log(`   - Total machines: ${Object.keys(mappingData.machines).length}`);

    // Verify the results
    const totalWithDex = Object.values(mappingData.machines).filter(machine =>
      machine.dex && machine.dex.length > 0
    ).length;

    console.log(`\n✅ Final verification: ${totalWithDex}/${Object.keys(mappingData.machines).length} machines now have DEX data`);

    return mappingData;

  } catch (error) {
    console.error('❌ Error in updateMappingWithLiveDex:', error);
    throw error;
  }
}

// Run if called directly
if (require.main === module) {
  updateMappingWithLiveDex()
    .then(() => {
      console.log('✅ Script completed successfully');
      process.exit(0);
    })
    .catch(error => {
      console.error('❌ Script failed:', error);
      process.exit(1);
    });
}

module.exports = { updateMappingWithLiveDex };
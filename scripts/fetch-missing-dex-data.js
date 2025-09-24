const fs = require('fs');
const path = require('path');
const axios = require('axios');

async function fetchMissingDexData() {
  try {
    console.log('🔍 Identifying machines missing DEX data...');

    // Load the current mapping to see what machines exist
    const mappingFile = path.join(__dirname, '..', 'public', 'data', 'case-serial-dex-mapping-new.json');
    const mappingData = JSON.parse(fs.readFileSync(mappingFile, 'utf8'));

    // Load existing comprehensive DEX data to see what we already have
    let existingDexData = { results: {} };
    const dexDataFile = path.join(__dirname, '..', 'public', 'data', 'comprehensive-dex-data.json');
    if (fs.existsSync(dexDataFile)) {
      existingDexData = JSON.parse(fs.readFileSync(dexDataFile, 'utf8'));
    }

    const allMachines = Object.keys(mappingData.machines);

    // Find machines that either don't exist in DEX data or have no actual DEX data
    const missingDexMachines = allMachines.filter(serial => {
      const result = existingDexData.results?.[serial];
      return !result || !result.latestDexData || !result.latestDexData.parsedData;
    });

    const machinesWithDexData = allMachines.length - missingDexMachines.length;

    console.log(`📊 Total machines: ${allMachines.length}`);
    console.log(`📊 Machines with DEX data: ${machinesWithDexData}`);
    console.log(`📊 Machines missing DEX data: ${missingDexMachines.length}`);

    if (missingDexMachines.length === 0) {
      console.log('✅ All machines already have DEX data!');
      return;
    }

    console.log('\n🔍 Missing DEX data for:');
    missingDexMachines.forEach(serial => {
      const machine = mappingData.machines[serial];
      console.log(`  - ${serial}: ${machine.details.machineLocation} (${machine.details.machineType})`);
    });

    console.log(`\n🚀 Starting DEX data fetch for ${missingDexMachines.length} machines...\n`);

    let successCount = 0;
    let errorCount = 0;

    // Process each missing machine
    for (let i = 0; i < missingDexMachines.length; i++) {
      const caseSerial = missingDexMachines[i];
      const machine = mappingData.machines[caseSerial];

      console.log(`[${i + 1}/${missingDexMachines.length}] Processing ${caseSerial}...`);
      console.log(`  Location: ${machine.details.machineLocation}`);
      console.log(`  Type: ${machine.details.machineType}`);

      try {
        // Step 1: Find the DEX ID for this case serial using the mock API
        console.log(`  🔍 Finding DEX ID for ${caseSerial}...`);
        const dexIdResponse = await axios.post('http://localhost:3300/api/cantaloupe/find-latest-dex-mock', {
          caseSerial: caseSerial
        });

        if (dexIdResponse.data.success && dexIdResponse.data.dexId) {
          const dexId = dexIdResponse.data.dexId;
          console.log(`  ✅ Found DEX ID: ${dexId}`);

          // Step 2: Fetch the parsed DEX data using the DEX ID
          console.log(`  📡 Fetching parsed DEX data...`);
          const parsedDexResponse = await axios.post('http://localhost:3300/api/cantaloupe/get-parsed-dex', {
            dexId: dexId
          });

          if (parsedDexResponse.data.success) {
            console.log(`  ✅ Successfully fetched parsed DEX data`);

            let parsedData = null;
            let rawData = null;

            if (parsedDexResponse.data.type === 'parsed_dex_json' && parsedDexResponse.data.data) {
              parsedData = parsedDexResponse.data.data;
              console.log(`  🔍 Parsed structure: ${parsedDexResponse.data.structure?.join(', ')}`);

              // Check for cash data
              if (parsedData.general?.CA17) {
                console.log(`  💰 Found cash data (CA17) for this machine!`);
              }
              if (parsedData.general?.CA1) {
                console.log(`  💰 Found CA1 cash box data`);
              }
              if (parsedData.general?.CA2) {
                console.log(`  💰 Found CA2 cash sales data`);
              }
            } else if (parsedDexResponse.data.type === 'text') {
              rawData = parsedDexResponse.data.rawResponse;
              console.log(`  📄 Got raw DEX text (${rawData?.length || 0} chars)`);
            }

            // Add this machine's data to the existing DEX data
            if (!existingDexData.results) {
              existingDexData.results = {};
            }

            existingDexData.results[caseSerial] = {
              machineDetails: machine.details,
              dexFetches: [{
                dexId: dexId,
                timestamp: new Date().toISOString(),
                fetchTimestamp: new Date().toISOString(),
                success: true,
                dataType: parsedDexResponse.data.type,
                parsedData: parsedData,
                rawData: rawData,
                responseLength: parsedDexResponse.data.responseLength || 0
              }],
              latestDexData: {
                dexId: dexId,
                timestamp: new Date().toISOString(),
                fetchTimestamp: new Date().toISOString(),
                success: true,
                dataType: parsedDexResponse.data.type,
                parsedData: parsedData,
                rawData: rawData,
                responseLength: parsedDexResponse.data.responseLength || 0
              },
              errors: []
            };

            successCount++;

          } else {
            console.log(`  ❌ Failed to fetch DEX data: ${parsedDexResponse.data.error || 'Unknown error'}`);
            errorCount++;
          }

        } else {
          console.log(`  ⚠️  No DEX ID found for this machine`);

          // Still add an entry but with no DEX data
          if (!existingDexData.results) {
            existingDexData.results = {};
          }

          existingDexData.results[caseSerial] = {
            machineDetails: machine.details,
            dexFetches: [],
            latestDexData: null,
            errors: [{
              error: 'No DEX ID found',
              timestamp: new Date().toISOString()
            }]
          };
        }

      } catch (error) {
        console.log(`  ❌ Error processing ${caseSerial}: ${error.message}`);
        errorCount++;

        // Add error entry
        if (!existingDexData.results) {
          existingDexData.results = {};
        }

        existingDexData.results[caseSerial] = {
          machineDetails: machine.details,
          dexFetches: [],
          latestDexData: null,
          errors: [{
            error: error.message,
            timestamp: new Date().toISOString()
          }]
        };
      }

      // Small delay between requests
      if (i < missingDexMachines.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }

    // Update metadata
    existingDexData.timestamp = new Date().toISOString();
    existingDexData.note = "Complete DEX data including newly fetched machines";
    existingDexData.machineCount = Object.keys(existingDexData.results).length;

    // Save updated comprehensive DEX data
    const outputFile = path.join(__dirname, '..', 'public', 'data', 'comprehensive-dex-data.json');
    fs.writeFileSync(outputFile, JSON.stringify(existingDexData, null, 2));

    console.log('\n🎉 Missing DEX data fetch completed!');
    console.log(`📊 Summary:`);
    console.log(`   - Machines processed: ${missingDexMachines.length}`);
    console.log(`   - Successful fetches: ${successCount}`);
    console.log(`   - Errors: ${errorCount}`);
    console.log(`   - Total machines with data now: ${Object.keys(existingDexData.results).length}`);

    // Analyze cash data in the updated dataset
    const cashAnalysis = {
      withCA17: 0,
      withCA1: 0,
      withCA2: 0
    };

    Object.values(existingDexData.results).forEach(result => {
      if (result.latestDexData?.parsedData?.general) {
        const general = result.latestDexData.parsedData.general;
        if (general.CA17) cashAnalysis.withCA17++;
        if (general.CA1) cashAnalysis.withCA1++;
        if (general.CA2) cashAnalysis.withCA2++;
      }
    });

    console.log(`\n💰 Updated Cash Data Analysis:`);
    console.log(`   - Machines with CA17 (cash handling): ${cashAnalysis.withCA17}`);
    console.log(`   - Machines with CA1 (cash box): ${cashAnalysis.withCA1}`);
    console.log(`   - Machines with CA2 (cash sales): ${cashAnalysis.withCA2}`);

    return existingDexData;

  } catch (error) {
    console.error('❌ Error in fetchMissingDexData:', error);
    throw error;
  }
}

// Run if called directly
if (require.main === module) {
  fetchMissingDexData()
    .then(() => {
      console.log('✅ Script completed successfully');
      process.exit(0);
    })
    .catch(error => {
      console.error('❌ Script failed:', error);
      process.exit(1);
    });
}

module.exports = { fetchMissingDexData };
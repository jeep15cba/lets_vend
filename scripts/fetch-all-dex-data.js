const fs = require('fs');
const path = require('path');
const axios = require('axios');

async function fetchAllDexData() {
  try {
    console.log('🚀 Starting comprehensive DEX data fetch for all machines...');

    // Load the mapping file to get all machines and their dexIds
    const mappingFile = path.join(__dirname, '..', 'public', 'data', 'case-serial-dex-mapping-new.json');
    const mappingData = JSON.parse(fs.readFileSync(mappingFile, 'utf8'));

    const machines = mappingData.machines;
    const machineCount = Object.keys(machines).length;
    console.log(`📊 Found ${machineCount} machines to process`);

    // Prepare results storage
    const dexResults = {
      timestamp: new Date().toISOString(),
      note: "Comprehensive DEX data fetch for all machines with parsed data",
      source: "Cantaloupe DEX API via localhost:3300",
      machineCount: machineCount,
      results: {}
    };

    let processedCount = 0;
    let successCount = 0;
    let errorCount = 0;

    // Process each machine
    for (const [caseSerial, machineData] of Object.entries(machines)) {
      processedCount++;
      console.log(`\n[${processedCount}/${machineCount}] Processing ${caseSerial}...`);
      console.log(`  Type: ${machineData.details.machineType} | Model: ${machineData.details.machineModel}`);
      console.log(`  Location: ${machineData.details.machineLocation}`);

      // Initialize result for this machine
      dexResults.results[caseSerial] = {
        machineDetails: machineData.details,
        dexFetches: [],
        latestDexData: null,
        errors: []
      };

      // Process each DEX record for this machine
      if (machineData.dex && machineData.dex.length > 0) {
        console.log(`  📡 Found ${machineData.dex.length} DEX record(s)`);

        for (const dexRecord of machineData.dex) {
          if (dexRecord.dexId) {
            try {
              console.log(`    Fetching DEX ID: ${dexRecord.dexId}...`);

              // Use the parsed DEX API endpoint to get structured data
              const response = await axios.post('http://localhost:3300/api/cantaloupe/get-parsed-dex', {
                dexId: dexRecord.dexId
              });

              if (response.data.success) {
                console.log(`    ✅ Successfully fetched parsed DEX data`);

                let parsedData = null;
                let rawData = null;

                if (response.data.type === 'parsed_dex_json' && response.data.data) {
                  parsedData = response.data.data;
                  console.log(`    🔍 Parsed DEX structure: ${response.data.structure?.join(', ')}`);

                  // Check for cash data (CA17 field)
                  if (parsedData.general?.CA17) {
                    console.log(`    💰 Found cash data (CA17) for this machine`);
                  }
                } else if (response.data.type === 'text') {
                  rawData = response.data.rawResponse;
                  console.log(`    📄 Got raw DEX text (${rawData?.length || 0} chars)`);
                }

                // Store the fetch result
                const fetchResult = {
                  dexId: dexRecord.dexId,
                  timestamp: dexRecord.timestamp,
                  fetchTimestamp: new Date().toISOString(),
                  success: true,
                  dataType: response.data.type,
                  parsedData: parsedData,
                  rawData: rawData,
                  responseLength: response.data.responseLength || 0
                };

                dexResults.results[caseSerial].dexFetches.push(fetchResult);

                // Set as latest if this is the most recent
                if (!dexResults.results[caseSerial].latestDexData ||
                    new Date(dexRecord.timestamp) > new Date(dexResults.results[caseSerial].latestDexData.timestamp)) {
                  dexResults.results[caseSerial].latestDexData = fetchResult;
                }

                successCount++;

              } else {
                console.log(`    ❌ Failed to fetch DEX data: ${response.data.error || 'Unknown error'}`);
                dexResults.results[caseSerial].errors.push({
                  dexId: dexRecord.dexId,
                  error: response.data.error || 'Unknown error',
                  timestamp: new Date().toISOString()
                });
                errorCount++;
              }

            } catch (error) {
              console.log(`    ❌ Network error: ${error.message}`);
              dexResults.results[caseSerial].errors.push({
                dexId: dexRecord.dexId,
                error: error.message,
                timestamp: new Date().toISOString()
              });
              errorCount++;
            }

            // Small delay to avoid overwhelming the API
            await new Promise(resolve => setTimeout(resolve, 200));
          }
        }
      } else {
        console.log(`  ⚪ No DEX records found`);
      }
    }

    // Save results
    const outputFile = path.join(__dirname, '..', 'data', 'comprehensive-dex-data.json');
    fs.writeFileSync(outputFile, JSON.stringify(dexResults, null, 2));

    console.log('\n🎉 DEX data fetch completed!');
    console.log(`📊 Summary:`);
    console.log(`   - Total machines processed: ${processedCount}`);
    console.log(`   - Successful DEX fetches: ${successCount}`);
    console.log(`   - Failed DEX fetches: ${errorCount}`);
    console.log(`   - Results saved to: ${outputFile}`);

    // Create a summary of machines with cash data and other important fields
    const machinesWithCashData = [];
    const machinesWithCA1Data = [];
    const machinesWithCA2Data = [];

    Object.entries(dexResults.results).forEach(([caseSerial, result]) => {
      if (result.latestDexData?.parsedData?.general) {
        const general = result.latestDexData.parsedData.general;

        if (general.CA17) {
          machinesWithCashData.push({
            caseSerial,
            location: result.machineDetails.machineLocation,
            cashData: general.CA17
          });
        }

        if (general.CA1) {
          machinesWithCA1Data.push({
            caseSerial,
            location: result.machineDetails.machineLocation,
            ca1Data: general.CA1
          });
        }

        if (general.CA2) {
          machinesWithCA2Data.push({
            caseSerial,
            location: result.machineDetails.machineLocation,
            ca2Data: general.CA2
          });
        }
      }
    });

    console.log(`\n📊 DEX Data Analysis:`);
    console.log(`   💰 Machines with CA17 (cash handling): ${machinesWithCashData.length}`);
    console.log(`   💰 Machines with CA1 (cash box): ${machinesWithCA1Data.length}`);
    console.log(`   💰 Machines with CA2 (cash sales): ${machinesWithCA2Data.length}`);

    if (machinesWithCashData.length > 0) {
      console.log(`\n💰 Machines with CA17 cash handling data:`);
      machinesWithCashData.forEach(machine => {
        console.log(`   - ${machine.caseSerial}: ${machine.location}`);
        if (typeof machine.cashData === 'object') {
          console.log(`     Keys: ${Object.keys(machine.cashData).join(', ')}`);
        }
      });
    }

    return dexResults;

  } catch (error) {
    console.error('❌ Error in fetchAllDexData:', error);
    throw error;
  }
}

// Run if called directly
if (require.main === module) {
  fetchAllDexData()
    .then(() => {
      console.log('✅ Script completed successfully');
      process.exit(0);
    })
    .catch(error => {
      console.error('❌ Script failed:', error);
      process.exit(1);
    });
}

module.exports = { fetchAllDexData };
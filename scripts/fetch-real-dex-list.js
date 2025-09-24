const fs = require('fs');
const path = require('path');
const axios = require('axios');

async function fetchRealDexList() {
  try {
    console.log('🚀 Fetching complete DEX list from live Cantaloupe API...');

    // Step 1: Fetch the complete DEX list using the existing dex-raw API
    console.log('📡 Fetching complete DEX list via dex-raw API...');
    const dexListResponse = await axios.get('http://localhost:3300/api/cantaloupe/dex-raw?length=10000');

    if (!dexListResponse.data.success) {
      throw new Error('Failed to fetch DEX list: ' + dexListResponse.data.error);
    }

    const dexData = dexListResponse.data.data;
    console.log(`✅ Fetched ${dexData.data.length} DEX records`);
    console.log(`📊 Total records available: ${dexData.recordsTotal}`);

    // Step 3: Process the DEX data to create case serial to DEX ID mapping
    console.log('🔍 Processing DEX records...');

    const caseSerialToDexMapping = {};
    const dexStats = {
      totalRecords: dexData.data.length,
      uniqueCaseSerials: new Set(),
      byFirmware: {},
      byDate: {}
    };

    dexData.data.forEach(record => {
      const caseSerial = record.devices?.caseSerial;
      const dexId = record.dexRaw?.id;
      const created = record.dexRaw?.created;
      const firmware = record.dexRaw?.firmware || 'unknown';

      if (caseSerial && dexId) {
        dexStats.uniqueCaseSerials.add(caseSerial);

        // Track firmware versions
        dexStats.byFirmware[firmware] = (dexStats.byFirmware[firmware] || 0) + 1;

        // Track by date (just the date part)
        const dateOnly = created ? created.split(' ')[0] : 'unknown';
        dexStats.byDate[dateOnly] = (dexStats.byDate[dateOnly] || 0) + 1;

        // Store DEX record for this case serial (keep most recent)
        if (!caseSerialToDexMapping[caseSerial] ||
            new Date(created || 0) > new Date(caseSerialToDexMapping[caseSerial].timestamp || 0)) {

          caseSerialToDexMapping[caseSerial] = {
            dexId: dexId.toString(),
            timestamp: created || new Date().toISOString(),
            firmware: firmware,
            parsed: record.dexRaw?.parsed === 1,
            preprocessed: record.dexRaw?.preprocessed === 1,
            uploadReason: record.dexRaw?.uploadReason || 0,
            customer: record.customers?.name || 'Unknown'
          };
        }
      }
    });

    console.log(`\n📊 DEX Data Analysis:`);
    console.log(`   - Total DEX records processed: ${dexStats.totalRecords}`);
    console.log(`   - Unique case serials found: ${dexStats.uniqueCaseSerials.size}`);
    console.log(`   - Firmware versions: ${Object.keys(dexStats.byFirmware).length}`);

    // Show firmware breakdown
    console.log(`\n🔧 Firmware versions:`);
    Object.entries(dexStats.byFirmware)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 5)
      .forEach(([fw, count]) => {
        console.log(`   - ${fw}: ${count} records`);
      });

    // Show recent dates
    console.log(`\n📅 Recent DEX activity:`);
    Object.entries(dexStats.byDate)
      .sort(([a], [b]) => b.localeCompare(a))
      .slice(0, 5)
      .forEach(([date, count]) => {
        console.log(`   - ${date}: ${count} records`);
      });

    // Step 4: Load our current machine mapping to see what we can now populate
    console.log('\n🔍 Checking against our machine inventory...');
    const mappingFile = path.join(__dirname, '..', 'public', 'data', 'case-serial-dex-mapping-new.json');
    const mappingData = JSON.parse(fs.readFileSync(mappingFile, 'utf8'));
    const ourMachines = Object.keys(mappingData.machines);

    console.log(`📊 Our inventory: ${ourMachines.length} machines`);

    // Find matches
    const matchedMachines = [];
    const unmatchedMachines = [];

    ourMachines.forEach(caseSerial => {
      if (caseSerialToDexMapping[caseSerial]) {
        matchedMachines.push({
          caseSerial,
          dexId: caseSerialToDexMapping[caseSerial].dexId,
          location: mappingData.machines[caseSerial].details.machineLocation,
          type: mappingData.machines[caseSerial].details.machineType,
          firmware: caseSerialToDexMapping[caseSerial].firmware,
          timestamp: caseSerialToDexMapping[caseSerial].timestamp
        });
      } else {
        unmatchedMachines.push({
          caseSerial,
          location: mappingData.machines[caseSerial].details.machineLocation,
          type: mappingData.machines[caseSerial].details.machineType
        });
      }
    });

    console.log(`✅ Machines with DEX data: ${matchedMachines.length}`);
    console.log(`❌ Machines without DEX data: ${unmatchedMachines.length}`);

    if (matchedMachines.length > 0) {
      console.log(`\n✅ New machines found with DEX data:`);
      matchedMachines
        .filter(m => {
          // Check if this is a newly found machine (not in our existing DEX data)
          const existingDexFile = path.join(__dirname, '..', 'public', 'data', 'comprehensive-dex-data.json');
          if (fs.existsSync(existingDexFile)) {
            const existing = JSON.parse(fs.readFileSync(existingDexFile, 'utf8'));
            const hasExisting = existing.results?.[m.caseSerial]?.latestDexData?.parsedData;
            return !hasExisting;
          }
          return true;
        })
        .slice(0, 10)
        .forEach(m => {
          console.log(`   - ${m.caseSerial}: ${m.location} (${m.type}) -> DEX ID: ${m.dexId}`);
        });
    }

    if (unmatchedMachines.length > 0) {
      console.log(`\n❌ Machines still without DEX data:`);
      unmatchedMachines.slice(0, 10).forEach(m => {
        console.log(`   - ${m.caseSerial}: ${m.location} (${m.type})`);
      });
    }

    // Step 5: Save the complete mapping for future use
    const outputData = {
      timestamp: new Date().toISOString(),
      note: "Complete case serial to DEX ID mapping from live Cantaloupe API",
      source: "https://dashboard.cantaloupe.online/dex/getData",
      stats: {
        totalDexRecords: dexStats.totalRecords,
        uniqueMachines: dexStats.uniqueCaseSerials.size,
        ourMachinesMatched: matchedMachines.length,
        ourMachinesTotal: ourMachines.length
      },
      mapping: caseSerialToDexMapping
    };

    const outputFile = path.join(__dirname, '..', 'data', 'live-case-serial-dex-mapping.json');
    fs.writeFileSync(outputFile, JSON.stringify(outputData, null, 2));

    console.log(`\n💾 Complete mapping saved to: ${outputFile}`);
    console.log(`\n🎯 Ready to fetch DEX data for ${matchedMachines.length} machines!`);

    return {
      matchedMachines,
      unmatchedMachines,
      mapping: caseSerialToDexMapping
    };

  } catch (error) {
    console.error('❌ Error fetching DEX list:', error.message);
    throw error;
  }
}

// Run if called directly
if (require.main === module) {
  fetchRealDexList()
    .then((result) => {
      console.log('✅ DEX list fetch completed successfully');
      console.log(`📊 Final summary: ${result.matchedMachines.length} machines ready for DEX data fetch`);
      process.exit(0);
    })
    .catch(error => {
      console.error('❌ Script failed:', error);
      process.exit(1);
    });
}

module.exports = { fetchRealDexList };
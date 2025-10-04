export const runtime = 'edge';

export default async function handler(request) {
  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  try {
    console.log('Starting raw DEX data generation...');

    // Get cookies for authentication
    const baseUrl = request.headers.get('origin') || process.env.NEXT_PUBLIC_SITE_URL || 'https://lets-vend.pages.dev';
    const authResponse = await fetch(`${baseUrl}/api/cantaloupe/auth`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });

    const authData = await authResponse.json();
    if (!authData.success) {
      return new Response(JSON.stringify({ error: 'Authentication failed' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Fetch raw DEX data with larger record count to get all recent data
    const rawDexResponse = await fetch(`${baseUrl}/api/cantaloupe/dex-raw?length=1000`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cookies: authData.cookies })
    });

    const rawDexData = await rawDexResponse.json();
    if (!rawDexData.success || !rawDexData.data) {
      return new Response(JSON.stringify({ error: 'Failed to fetch raw DEX data' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    console.log('Raw DEX records found:', rawDexData.data.recordsTotal);

    // Process raw DEX data into structured format
    const processedData = {
      timestamp: new Date().toISOString(),
      note: "Complete DEX data using raw DEX records for maximum freshness",
      source: "Cantaloupe Raw DEX API",
      recordsTotal: rawDexData.data.recordsTotal,
      recordsReturned: rawDexData.data.data?.length || 0,
      results: {}
    };

    // Group raw DEX records by machine (using caseSerial)
    const machineGroups = {};

    if (rawDexData.data.data && Array.isArray(rawDexData.data.data)) {
      rawDexData.data.data.forEach(record => {
        const caseSerial = record.devices?.caseSerial;
        const customerName = record.customers?.name;
        const created = record.dexRaw?.created;
        const parsed = record.dexRaw?.parsed;
        const uploadReason = record.dexRaw?.uploadReason;
        const dexSource = record.dexRaw?.dexSource;
        const firmware = record.dexRaw?.firmware;
        const dexId = record.dexRaw?.id;

        if (caseSerial && caseSerial !== 'N/A') {
          if (!machineGroups[caseSerial]) {
            machineGroups[caseSerial] = {
              machineDetails: {
                caseSerial: caseSerial,
                customerName: customerName,
                lastUpdated: created,
                recordCount: 0
              },
              dexRecords: []
            };
          }

          machineGroups[caseSerial].dexRecords.push({
            dexId: dexId,
            created: created,
            parsed: parsed,
            uploadReason: uploadReason,
            dexSource: dexSource,
            firmware: firmware,
            rawRecord: record
          });

          machineGroups[caseSerial].machineDetails.recordCount++;

          // Update last updated time if this record is more recent
          if (new Date(created) > new Date(machineGroups[caseSerial].machineDetails.lastUpdated)) {
            machineGroups[caseSerial].machineDetails.lastUpdated = created;
          }
        }
      });
    }

    // Sort records within each machine by creation date (most recent first)
    Object.keys(machineGroups).forEach(caseSerial => {
      machineGroups[caseSerial].dexRecords.sort((a, b) =>
        new Date(b.created) - new Date(a.created)
      );
    });

    // Process each machine's most recent raw DEX data
    for (const [caseSerial, machineData] of Object.entries(machineGroups)) {
      const mostRecentRecord = machineData.dexRecords[0];

      // Parse the raw DEX data if it exists and is parsed
      let structuredDexData = null;
      if (mostRecentRecord.parsed && mostRecentRecord.parsed !== '0') {
        try {
          // For now, we'll structure the metadata - actual DEX parsing would require
          // fetching the individual DEX content, which we can add later
          structuredDexData = {
            metadata: {
              created: mostRecentRecord.created,
              parsed: mostRecentRecord.parsed,
              uploadReason: mostRecentRecord.uploadReason,
              dexSource: mostRecentRecord.dexSource,
              firmware: mostRecentRecord.firmware
            },
            // This would contain the actual parsed DEX data
            // We can enhance this by fetching individual DEX records
            dexContent: "Raw DEX content would be fetched here",
            recordHistory: machineData.dexRecords.slice(0, 5) // Keep 5 most recent records
          };
        } catch (e) {
          console.error(`Error processing DEX data for ${caseSerial}:`, e);
        }
      }

      processedData.results[caseSerial] = {
        machineDetails: machineData.machineDetails,
        latestDexData: structuredDexData,
        totalRecords: machineData.dexRecords.length,
        recentRecords: machineData.dexRecords.slice(0, 3)
      };
    }

    console.log(`Processed ${Object.keys(processedData.results).length} machines`);

    return new Response(JSON.stringify({
      success: true,
      data: processedData,
      machineCount: Object.keys(processedData.results).length,
      timestamp: new Date().toISOString()
    }), {
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Raw DEX data generation error:', error);
    return new Response(JSON.stringify({
      error: 'Failed to generate raw DEX data: ' + error.message
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
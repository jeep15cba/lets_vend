export const runtime = 'edge';

export default async function handler(request) {
  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  try {
    console.log('Starting comprehensive raw DEX data generation...');

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

    // Group raw DEX records by machine (using caseSerial) and keep only the most recent
    const machineLatestDex = {};

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
          // Only keep the most recent record for each machine
          if (!machineLatestDex[caseSerial] || new Date(created) > new Date(machineLatestDex[caseSerial].created)) {
            machineLatestDex[caseSerial] = {
              caseSerial: caseSerial,
              customerName: customerName,
              dexId: dexId,
              created: created,
              parsed: parsed,
              uploadReason: uploadReason,
              dexSource: dexSource,
              firmware: firmware,
              rawRecord: record
            };
          }
        }
      });
    }

    console.log(`Found ${Object.keys(machineLatestDex).length} unique machines`);

    // Now fetch the actual raw DEX content for each machine
    const processedData = {
      timestamp: new Date().toISOString(),
      note: "Comprehensive list of all machines with their latest DEX ID and raw DEX content",
      source: "Cantaloupe Raw DEX API + Individual DEX Content",
      totalMachines: Object.keys(machineLatestDex).length,
      machines: {}
    };

    const machineEntries = Object.entries(machineLatestDex);
    let processedCount = 0;

    for (const [caseSerial, latestDex] of machineEntries) {
      processedCount++;
      console.log(`Processing ${processedCount}/${machineEntries.length}: ${caseSerial} (DEX ID: ${latestDex.dexId})`);

      // Fetch the actual raw DEX content for this machine
      let rawDexContent = null;
      try {
        const dexContentResponse = await fetch(`${baseUrl}/api/cantaloupe/dex-data?machineId=${caseSerial}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ cookies: authData.cookies })
        });

        if (dexContentResponse.ok) {
          const dexContentData = await dexContentResponse.json();
          if (dexContentData.success) {
            rawDexContent = dexContentData.data || dexContentData.rawData;
          }
        }
      } catch (e) {
        console.error(`Failed to fetch DEX content for ${caseSerial}:`, e);
      }

      processedData.machines[caseSerial] = {
        caseSerial: caseSerial,
        customerName: latestDex.customerName,
        latestDexId: latestDex.dexId,
        latestDexCreated: latestDex.created,
        latestDexMetadata: {
          parsed: latestDex.parsed,
          uploadReason: latestDex.uploadReason,
          dexSource: latestDex.dexSource,
          firmware: latestDex.firmware
        },
        rawDexContent: rawDexContent,
        rawDexType: rawDexContent ? (typeof rawDexContent === 'string' ? 'text' : 'json') : null
      };

      // Add a small delay to avoid overwhelming the API
      if (processedCount % 10 === 0) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }

    console.log(`Processed ${processedCount} machines with raw DEX content`);

    return new Response(JSON.stringify({
      success: true,
      data: processedData,
      machineCount: Object.keys(processedData.machines).length,
      timestamp: new Date().toISOString()
    }), {
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Comprehensive raw DEX data generation error:', error);
    return new Response(JSON.stringify({
      error: 'Failed to generate comprehensive raw DEX data: ' + error.message
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
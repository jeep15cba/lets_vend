export const runtime = 'edge';

export default async function handler(request) {
  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  try {
    console.log('Starting full raw DEX data generation with actual content...');

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

    // Fetch raw DEX data to get machine list with latest DEX IDs
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

    // Group by machine and keep only the most recent
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
          if (!machineLatestDex[caseSerial] || new Date(created) > new Date(machineLatestDex[caseSerial].created)) {
            machineLatestDex[caseSerial] = {
              caseSerial: caseSerial,
              customerName: customerName,
              dexId: dexId,
              created: created,
              parsed: parsed,
              uploadReason: uploadReason,
              dexSource: dexSource,
              firmware: firmware
            };
          }
        }
      });
    }

    console.log(`Found ${Object.keys(machineLatestDex).length} unique machines`);

    // Now fetch actual DEX content by making direct requests to Cantaloupe's DEX endpoint
    const processedData = {
      timestamp: new Date().toISOString(),
      note: "Comprehensive list of all machines with their latest DEX ID and actual raw DEX content",
      source: "Cantaloupe Raw DEX API + Direct DEX Content Fetching",
      totalMachines: Object.keys(machineLatestDex).length,
      machines: {}
    };

    // Process machines one by one to get actual DEX content
    const machineEntries = Object.entries(machineLatestDex);
    let processedCount = 0;

    for (const [caseSerial, latestDex] of machineEntries.slice(0, 10)) { // Start with first 10 for testing
      processedCount++;
      console.log(`Processing ${processedCount}/${Math.min(10, machineEntries.length)}: ${caseSerial} (DEX ID: ${latestDex.dexId})`);

      let rawDexContent = null;
      let contentType = null;

      try {
        // Try to fetch DEX content directly from Cantaloupe using the DEX ID
        // This mimics what the dashboard does when viewing individual DEX records
        const dexContentUrl = `https://dashboard.cantaloupe.online/dex/view/${latestDex.dexId}`;

        const dexContentResponse = await fetch(dexContentUrl, {
          method: 'GET',
          headers: {
            'Cookie': authData.cookies,
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.9',
            'Connection': 'keep-alive'
          }
        });

        if (dexContentResponse.ok) {
          const contentTypeHeader = dexContentResponse.headers.get('content-type') || '';

          if (contentTypeHeader.includes('application/json')) {
            rawDexContent = await dexContentResponse.json();
            contentType = 'json';
          } else {
            const textContent = await dexContentResponse.text();
            // Look for DEX data in the HTML response
            if (textContent.includes('DXS') || textContent.includes('ST*') || textContent.includes('ID1')) {
              // Try to extract DEX data from HTML
              const dexMatch = textContent.match(/<pre[^>]*>([\s\S]*?)<\/pre>/i);
              if (dexMatch) {
                rawDexContent = dexMatch[1].trim();
                contentType = 'text';
              } else {
                rawDexContent = textContent.slice(0, 1000) + '...'; // Keep first 1000 chars for inspection
                contentType = 'html_snippet';
              }
            } else {
              rawDexContent = 'No DEX content found in response';
              contentType = 'error';
            }
          }
        } else {
          rawDexContent = `Failed to fetch: HTTP ${dexContentResponse.status}`;
          contentType = 'error';
        }

      } catch (e) {
        console.error(`Failed to fetch DEX content for ${caseSerial}:`, e);
        rawDexContent = `Error: ${e.message}`;
        contentType = 'error';
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
        rawDexType: contentType
      };

      // Small delay to avoid overwhelming the server
      await new Promise(resolve => setTimeout(resolve, 200));
    }

    console.log(`Successfully processed ${processedCount} machines with DEX content`);

    return new Response(JSON.stringify({
      success: true,
      data: processedData,
      machineCount: Object.keys(processedData.machines).length,
      timestamp: new Date().toISOString()
    }), {
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Full raw DEX data generation error:', error);
    return new Response(JSON.stringify({
      error: 'Failed to generate full raw DEX data: ' + error.message
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
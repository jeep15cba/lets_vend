export const runtime = 'edge';

export default async function handler(request) {
  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  try {
    console.log('Fetching actual raw DEX content for all machines...');

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

    // Load the existing comprehensive data with DEX IDs
    const existingDataResponse = await fetch(`${baseUrl}/data/comprehensive-raw-dex-data.json`);
    const responseData = await existingDataResponse.json();

    // Handle nested data structure from previous API response
    const existingData = responseData.data || responseData;

    if (!existingData || !existingData.machines) {
      return new Response(JSON.stringify({ error: 'No machine data found in comprehensive file' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    console.log(`Processing ${existingData.totalMachines} machines for actual DEX content...`);

    const updatedData = {
      ...existingData,
      lastUpdated: new Date().toISOString(),
      note: "Comprehensive list of all machines with their latest DEX ID and actual raw DEX content"
    };

    const machineEntries = Object.entries(existingData.machines);
    let successCount = 0;
    let errorCount = 0;

    // Extract CSRF token from dashboard page (needed for getRawDex requests)
    let csrfToken = null;
    try {
      const dashResponse = await fetch('https://dashboard.cantaloupe.online/', {
        method: 'GET',
        headers: {
          'Cookie': authData.cookies,
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
          'Connection': 'keep-alive'
        }
      });

      const dashHtml = await dashResponse.text();
      console.log('Dashboard page response status:', dashResponse.status);

      // Look for CSRF token
      const metaMatch = dashHtml.match(/<meta\s+name="csrf-token"\s+content="([^"]+)"/i);
      if (metaMatch) {
        csrfToken = metaMatch[1];
        console.log('CSRF token found in meta tag');
      } else {
        const patterns = [
          /name="_token"\s+value="([^"]+)"/,
          /csrf[_-]?token['"]\s*:\s*['"]([^'"]+)['"]/i,
          /_token['"]\s*:\s*['"]([^'"]+)['"]/
        ];

        for (const pattern of patterns) {
          const match = dashHtml.match(pattern);
          if (match) {
            csrfToken = match[1];
            console.log('CSRF token found with pattern:', pattern.source);
            break;
          }
        }
      }
    } catch (e) {
      console.error('Error fetching dashboard page:', e);
    }

    for (const [caseSerial, machineData] of machineEntries) {
      console.log(`Fetching raw DEX content for ${caseSerial} (DEX ID: ${machineData.latestDexId})...`);

      try {
        // Use the getRawDex endpoint with the specific DEX ID
        const rawDexResponse = await fetch(`https://dashboard.cantaloupe.online/dex/getRawDex/${machineData.latestDexId}`, {
          method: 'POST',
          headers: {
            'Cookie': authData.cookies,
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.9',
            'Accept-Encoding': 'gzip, deflate, br',
            'X-CSRF-TOKEN': csrfToken || '',
            'X-Requested-With': 'XMLHttpRequest',
            'Referer': 'https://dashboard.cantaloupe.online/',
            'Connection': 'keep-alive',
            'Cache-Control': 'no-cache',
            'Pragma': 'no-cache'
          }
        });

        if (rawDexResponse.ok) {
          const contentType = rawDexResponse.headers.get('content-type') || '';
          const contentEncoding = rawDexResponse.headers.get('content-encoding') || '';
          let rawContent;
          let contentFormat;

          console.log(`Response for ${caseSerial}: Content-Type: ${contentType}, Content-Encoding: ${contentEncoding}`);

          // Handle response content (may be gzipped)
          let textContent;
          if (contentEncoding.includes('gzip')) {
            // Try to get as text first (browser may auto-decompress)
            try {
              textContent = await rawDexResponse.text();
              contentFormat = 'auto_decompressed';
            } catch (e) {
              // Fallback to arrayBuffer and manual decode
              const buffer = await rawDexResponse.arrayBuffer();
              const decoder = new TextDecoder();
              textContent = decoder.decode(new Uint8Array(buffer));
              contentFormat = 'manual_decode';
            }
          } else if (contentType.includes('application/json')) {
            rawContent = await rawDexResponse.json();
            contentFormat = 'json';
          } else {
            textContent = await rawDexResponse.text();
            contentFormat = 'text';
          }

          // Process text content (whether gzipped or not)
          if (textContent) {
            // Clean up common HTML entities or wrapper text
            if (textContent.includes('<!DOCTYPE') || textContent.includes('<html>')) {
              rawContent = 'HTML response received instead of DEX data';
              contentFormat = 'html_error';
            } else {
              // Parse and structure the DEX data
              const dexLines = textContent.split(/\r?\n/).filter(line => line.trim());
              const structuredDex = {};

              dexLines.forEach(line => {
                const parts = line.split('*');
                if (parts.length >= 2) {
                  const fieldType = parts[0];
                  if (!structuredDex[fieldType]) {
                    structuredDex[fieldType] = [];
                  }
                  structuredDex[fieldType].push({
                    raw: line,
                    data: parts.slice(1)
                  });
                }
              });

              rawContent = {
                raw: textContent,
                structured: structuredDex,
                lineCount: dexLines.length,
                summary: {
                  totalLines: dexLines.length,
                  fieldTypes: Object.keys(structuredDex),
                  hasCoins: structuredDex.CA17 ? structuredDex.CA17.length : 0,
                  hasProducts: structuredDex.PA1 ? structuredDex.PA1.length : 0,
                  hasTemperature: structuredDex.MA5 ? structuredDex.MA5.filter(m => m.raw.includes('TEMPERATURE')).length : 0
                }
              };
              contentFormat = 'structured_dex';

              console.log(`✓ Structured DEX for ${caseSerial}: ${dexLines.length} lines, ${Object.keys(structuredDex).length} field types`);
            }
          }

          // Update the machine data with actual content
          updatedData.machines[caseSerial] = {
            ...machineData,
            rawDexContent: rawContent,
            rawDexType: contentFormat,
            fetchedAt: new Date().toISOString()
          };

          successCount++;
          console.log(`✓ Successfully fetched DEX content for ${caseSerial} (${contentFormat})`);

        } else {
          console.log(`✗ Failed to fetch DEX content for ${caseSerial}: HTTP ${rawDexResponse.status}`);
          updatedData.machines[caseSerial] = {
            ...machineData,
            rawDexContent: `HTTP Error ${rawDexResponse.status}`,
            rawDexType: 'error',
            fetchedAt: new Date().toISOString()
          };
          errorCount++;
        }

      } catch (error) {
        console.error(`Error fetching DEX content for ${caseSerial}:`, error);
        updatedData.machines[caseSerial] = {
          ...machineData,
          rawDexContent: `Error: ${error.message}`,
          rawDexType: 'error',
          fetchedAt: new Date().toISOString()
        };
        errorCount++;
      }

      // Add delay to avoid overwhelming the API
      await new Promise(resolve => setTimeout(resolve, 300));
    }

    console.log(`Completed: ${successCount} successful, ${errorCount} errors`);

    return new Response(JSON.stringify({
      success: true,
      data: updatedData,
      summary: {
        totalMachines: existingData.totalMachines,
        successfulFetches: successCount,
        errors: errorCount,
        timestamp: new Date().toISOString()
      }
    }), {
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Fetch raw DEX content error:', error);
    return new Response(JSON.stringify({
      error: 'Failed to fetch raw DEX content: ' + error.message
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
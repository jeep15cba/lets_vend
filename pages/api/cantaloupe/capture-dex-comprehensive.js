
export const runtime = 'edge';

export default async function handler(request) {
  if (request.method !== 'GET' && request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: { "Content-Type": "application/json" } });
  }

  try {
    console.log('Comprehensive DEX data capture from Cantaloupe dashboard...');

    // Get cookies from request body or authenticate to get new cookies
    let body = {};
    if (request.method === 'POST') {
      body = await request.json().catch(() => ({}));
    }
    let cookies = body.cookies;

    if (!cookies) {
      console.log('No cookies provided, authenticating for DEX capture...');
      const baseUrl = request.headers.get('origin') || process.env.NEXT_PUBLIC_SITE_URL || 'https://lets-vend.pages.dev';
      const authResponse = await fetch(`${baseUrl}/api/cantaloupe/auth`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        }
      });

      const authData = await authResponse.json();

      if (!authData.success) {
        return new Response(JSON.stringify({ error: 'Authentication failed' }), { status: 401, headers: { "Content-Type": "application/json" } });
      }

      cookies = authData.cookies;
    }

    console.log('Fetching DEX dashboard page...');

    const dexPageResponse = await fetch('https://dashboard.cantaloupe.online/dex', {
      method: 'GET',
      headers: {
        'Cookie': cookies,
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Cache-Control': 'no-cache'
      }
    });

    const dexPageHtml = await dexPageResponse.text();
    console.log('DEX page response status:', dexPageResponse.status);
    console.log('DEX page HTML length:', dexPageHtml.length);

    if (!dexPageResponse.ok) {
      return new Response(JSON.stringify({
        error: `Failed to fetch DEX page: ${dexPageResponse.status}`,
        htmlPreview: dexPageHtml.substring(0, 1000)
      }), { status: dexPageResponse.status, headers: { "Content-Type": "application/json" } });
    }

    // Extract CSRF token
    let csrfToken = null;
    const csrfPatterns = [
      /<meta\s+name="csrf-token"\s+content="([^"]+)"/i,
      /'X-CSRF-TOKEN':\s*'([^']+)'/i,
      /csrf[_-]?token['"]\s*:\s*['"']([^'"]+)['"]/i
    ];

    for (const pattern of csrfPatterns) {
      const match = dexPageHtml.match(pattern);
      if (match) {
        csrfToken = match[1];
        console.log('CSRF token extracted');
        break;
      }
    }

    // Multiple strategies to get DEX data:

    console.log('Strategy 1: Try POST to /dex with various parameter combinations...');

    const strategies = [
      {
        name: 'Empty POST',
        body: ''
      },
      {
        name: 'Simple draw',
        body: 'draw=1'
      },
      {
        name: 'Basic pagination',
        body: 'draw=1&start=0&length=25'
      },
      {
        name: 'Full DataTables',
        body: new URLSearchParams({
          'draw': '1',
          'start': '0',
          'length': '50',
          'search[value]': '',
          'search[regex]': 'false',
          'order[0][column]': '1',
          'order[0][dir]': 'desc'
        }).toString()
      }
    ];

    let successfulData = null;
    let workingStrategy = null;

    for (const strategy of strategies) {
      console.log(`Trying strategy: ${strategy.name}`);

      try {
        const strategyResponse = await fetch('https://dashboard.cantaloupe.online/dex', {
          method: 'POST',
          headers: {
            'Cookie': cookies,
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36',
            'Accept': 'application/json, text/javascript, */*; q=0.01',
            'Accept-Language': 'en-US,en;q=0.9',
            'X-CSRF-TOKEN': csrfToken || '',
            'X-Requested-With': 'XMLHttpRequest',
            'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
            'Origin': 'https://dashboard.cantaloupe.online',
            'Referer': 'https://dashboard.cantaloupe.online/dex'
          },
          body: strategy.body
        });

        const strategyResponseText = await strategyResponse.text();
        console.log(`${strategy.name} response: ${strategyResponse.status} (${strategyResponseText.length} bytes)`);

        if (strategyResponse.ok && strategyResponseText.length > 100) {
          try {
            const jsonData = JSON.parse(strategyResponseText);
            if (jsonData.data && Array.isArray(jsonData.data) && jsonData.data.length > 0) {
              successfulData = jsonData;
              workingStrategy = strategy.name;
              console.log(`SUCCESS with ${strategy.name}: Found ${jsonData.data.length} records`);
              break;
            }
          } catch (parseError) {
            console.log(`${strategy.name}: Not JSON or empty data`);
          }
        }

      } catch (strategyError) {
        console.error(`${strategy.name} failed:`, strategyError.message);
      }
    }

    // If no strategy worked, try to extract any embedded data from the HTML
    if (!successfulData) {
      console.log('Strategy 2: Looking for embedded data in HTML...');

      // Look for any JSON data embedded in script tags
      const scriptMatches = dexPageHtml.match(/<script[^>]*>([\s\S]*?)<\/script>/gi);
      let embeddedData = [];

      if (scriptMatches) {
        scriptMatches.forEach((script, index) => {
          // Look for JSON objects that might contain DEX data
          const jsonMatches = script.match(/\{[^{}]*"dexRaw"[^{}]*\}/g);
          if (jsonMatches) {
            console.log(`Found potential DEX data in script ${index}`);
            jsonMatches.forEach(jsonStr => {
              try {
                const data = JSON.parse(jsonStr);
                if (data.dexRaw && data.devices) {
                  embeddedData.push(data);
                }
              } catch (e) {
                // Ignore parse errors
              }
            });
          }
        });
      }

      if (embeddedData.length > 0) {
        successfulData = { data: embeddedData };
        workingStrategy = 'HTML embedded';
        console.log(`Found ${embeddedData.length} embedded DEX records`);
      }
    }

    // Extract mappings if we found data
    const mappings = {};
    let validMappingsCount = 0;

    if (successfulData && successfulData.data) {
      successfulData.data.forEach((record, index) => {
        try {
          const devices = record.devices;
          const dexRaw = record.dexRaw;

          if (devices && devices.caseSerial && dexRaw && dexRaw.id) {
            mappings[devices.caseSerial] = {
              dexId: dexRaw.id.toString(),
              created: dexRaw.created,
              firmware: dexRaw.firmware || 'Unknown',
              parsed: !!dexRaw.parsed,
              customer: record.customers?.name || 'Unknown'
            };
            validMappingsCount++;
            console.log(`Mapped ${devices.caseSerial} → DEX ID ${dexRaw.id}`);
          }
        } catch (recordError) {
          console.error(`Error processing record ${index}:`, recordError.message);
        }
      });
    }

    console.log(`Final result: ${validMappingsCount} valid DEX mappings extracted`);

    return new Response(JSON.stringify({
      success: true,
      workingStrategy: workingStrategy,
      totalRecords: successfulData?.recordsTotal || successfulData?.data?.length || 0,
      dataFound: successfulData?.data?.length || 0,
      validMappings: validMappingsCount,
      mappings: mappings,
      csrfToken: csrfToken ? csrfToken.substring(0, 10) + '...' : null,
      timestamp: new Date().toISOString()
    }), { headers: { "Content-Type": "application/json" } });

  } catch (error) {
    console.error('Comprehensive DEX capture error:', error);
    return new Response(JSON.stringify({
      error: 'Failed to capture DEX data: ' + error.message
    }), { status: 500, headers: { "Content-Type": "application/json" } });
  }
}
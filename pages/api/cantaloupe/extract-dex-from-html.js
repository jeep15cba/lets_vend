export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    console.log('Extracting DEX mappings from HTML page...');

    // Get cookies from request body or authenticate to get new cookies
    let cookies = req.body?.cookies;

    if (!cookies) {
      console.log('No cookies provided, authenticating for HTML DEX extraction...');
      const authResponse = await fetch(`${req.headers.origin || 'http://localhost:3300'}/api/cantaloupe/auth`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        }
      });

      const authData = await authResponse.json();

      if (!authData.success) {
        return res.status(401).json({ error: 'Authentication failed' });
      }

      cookies = authData.cookies;
    }

    console.log('Fetching DEX page HTML...');

    // Fetch the DEX page HTML
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
      return res.status(dexPageResponse.status).json({
        error: `Failed to fetch DEX page: ${dexPageResponse.status}`,
        htmlPreview: dexPageHtml.substring(0, 1000)
      });
    }

    // Extract mappings from various sources in the HTML
    const mappings = {};
    let extractedCount = 0;

    // Strategy 1: Look for embedded JSON in script tags
    console.log('Strategy 1: Searching for embedded JSON data...');
    const scriptMatches = dexPageHtml.match(/<script[^>]*>([\s\S]*?)<\/script>/gi);
    if (scriptMatches) {
      scriptMatches.forEach((script, index) => {
        // Look for DEX data patterns
        const patterns = [
          /"devices":\{"caseSerial":"([^"]+)"\}.*?"dexRaw":\{"id":(\d+)/g,
          /"caseSerial":"([^"]+)".*?"dexRaw":\{"id":(\d+)/g,
          /"dexRaw":\{"id":(\d+).*?"devices":\{"caseSerial":"([^"]+)"\}/g
        ];

        patterns.forEach(pattern => {
          let match;
          while ((match = pattern.exec(script)) !== null) {
            const caseSerial = match[1] || match[3];
            const dexId = match[2] || match[1];
            if (caseSerial && dexId) {
              mappings[caseSerial] = {
                dexId: dexId.toString(),
                source: 'script_embedded',
                scriptIndex: index
              };
              extractedCount++;
              console.log(`Found mapping: ${caseSerial} → DEX ID ${dexId}`);
            }
          }
        });
      });
    }

    // Strategy 2: Look for data in HTML tables
    console.log('Strategy 2: Searching for table data...');
    const tableMatches = dexPageHtml.match(/<table[\s\S]*?<\/table>/gi);
    if (tableMatches) {
      tableMatches.forEach((table) => {
        // Look for table rows with case serial and DEX data
        const rowMatches = table.match(/<tr[\s\S]*?<\/tr>/gi);
        if (rowMatches) {
          rowMatches.forEach((row) => {
            const caseSerialMatch = row.match(/CSA\d{9}|55\d{10}/);
            const dexIdMatch = row.match(/data-dex-id="(\d+)"|\/dex\/(\d+)|dexRaw.*?(\d{8,})/);

            if (caseSerialMatch && dexIdMatch) {
              const caseSerial = caseSerialMatch[0];
              const dexId = dexIdMatch[1] || dexIdMatch[2] || dexIdMatch[3];

              if (!mappings[caseSerial]) {
                mappings[caseSerial] = {
                  dexId: dexId.toString(),
                  source: 'table_row'
                };
                extractedCount++;
                console.log(`Found mapping: ${caseSerial} → DEX ID ${dexId}`);
              }
            }
          });
        }
      });
    }

    // Strategy 3: Look for any case serial and DEX ID patterns in the raw HTML
    console.log('Strategy 3: Searching for patterns in raw HTML...');
    const caseSerialPattern = /(CSA\d{9}|55\d{10})/g;
    const dexIdPattern = /(\d{8,})/g;

    let caseSerialMatch;
    const foundSerials = [];
    while ((caseSerialMatch = caseSerialPattern.exec(dexPageHtml)) !== null) {
      foundSerials.push({
        serial: caseSerialMatch[1],
        position: caseSerialMatch.index
      });
    }

    let dexIdMatch;
    const foundIds = [];
    while ((dexIdMatch = dexIdPattern.exec(dexPageHtml)) !== null) {
      const id = dexIdMatch[1];
      // Filter for likely DEX IDs (8+ digits, reasonable range)
      if (id.length >= 7 && parseInt(id) > 1000000 && parseInt(id) < 100000000) {
        foundIds.push({
          id: id,
          position: dexIdMatch.index
        });
      }
    }

    // Try to pair nearby serials and IDs
    foundSerials.forEach(serial => {
      const nearbyIds = foundIds.filter(id =>
        Math.abs(id.position - serial.position) < 500 // Within 500 characters
      );

      if (nearbyIds.length > 0 && !mappings[serial.serial]) {
        // Take the closest ID
        const closestId = nearbyIds.reduce((closest, current) =>
          Math.abs(current.position - serial.position) < Math.abs(closest.position - serial.position)
            ? current : closest
        );

        mappings[serial.serial] = {
          dexId: closestId.id,
          source: 'proximity_match',
          distance: Math.abs(closestId.position - serial.position)
        };
        extractedCount++;
        console.log(`Found proximity mapping: ${serial.serial} → DEX ID ${closestId.id}`);
      }
    });

    console.log(`Total mappings extracted: ${extractedCount}`);

    res.status(200).json({
      success: true,
      method: 'html_extraction',
      totalMappings: extractedCount,
      mappings: mappings,
      stats: {
        scriptsFound: scriptMatches?.length || 0,
        tablesFound: tableMatches?.length || 0,
        caseSerialCount: foundSerials.length,
        dexIdCount: foundIds.length
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('HTML DEX extraction error:', error);
    res.status(500).json({
      error: 'Failed to extract DEX mappings from HTML: ' + error.message
    });
  }
}
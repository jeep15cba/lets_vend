export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    console.log('Capturing DEX mappings from dashboard.cantaloupe.online/dex...');

    // Get cookies from request body or authenticate to get new cookies
    let cookies = req.body?.cookies;

    if (!cookies) {
      console.log('No cookies provided, authenticating for DEX mappings capture...');
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

    console.log('Fetching DEX page to extract embedded data...');

    // First, let's try to get the page and see if there's any embedded JSON data or AJAX calls we can intercept
    const dexPageResponse = await fetch('https://dashboard.cantaloupe.online/dex', {
      method: 'GET',
      headers: {
        'Cookie': cookies,
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'gzip, deflate, br, zstd',
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache'
      }
    });

    const dexPageHtml = await dexPageResponse.text();
    console.log('DEX page response status:', dexPageResponse.status);
    console.log('DEX page HTML length:', dexPageHtml.length);

    if (!dexPageResponse.ok) {
      return res.status(dexPageResponse.status).json({
        error: `Failed to fetch DEX page: ${dexPageResponse.status} ${dexPageResponse.statusText}`,
        htmlPreview: dexPageHtml.substring(0, 1000)
      });
    }

    // Extract CSRF token from the page for potential AJAX calls
    let csrfToken = null;
    const csrfPatterns = [
      /<meta\s+name="csrf-token"\s+content="([^"]+)"/i,
      /csrf[_-]?token['"]\s*:\s*['"']([^'"]+)['"]/i,
      /_token['"]\s*:\s*['"']([^'"]+)['"]/,
      /'X-CSRF-TOKEN':\s*'([^']+)'/i
    ];

    for (const pattern of csrfPatterns) {
      const match = dexPageHtml.match(pattern);
      if (match) {
        csrfToken = match[1];
        console.log('CSRF token found for DEX page');
        break;
      }
    }

    // Since the AJAX endpoints are failing, let's try a different approach:
    // Look for any JavaScript that might initialize the DataTable with data
    // or try to make a simple GET request to see if there's any data embedded

    // Try to extract the DataTable configuration
    const datatableConfigMatch = dexPageHtml.match(/DataTable\(\{([^}]+(?:\{[^}]*\}[^}]*)*)\}/s);
    let ajaxUrl = null;

    if (datatableConfigMatch) {
      const config = datatableConfigMatch[1];
      console.log('DataTable config found:', config.substring(0, 200) + '...');

      // Look for the AJAX URL in the config
      const ajaxUrlMatch = config.match(/url:\s*['"']([^'"]+)['"]/);
      if (ajaxUrlMatch) {
        ajaxUrl = ajaxUrlMatch[1];
        console.log('Found AJAX URL:', ajaxUrl);
      }
    }

    // Try making a minimal request to the AJAX URL if we found one
    let dexData = [];
    let totalRecords = 0;
    let error = null;

    if (ajaxUrl) {
      console.log('Attempting to fetch data from AJAX URL:', ajaxUrl);

      try {
        // Try with minimal parameters
        const ajaxResponse = await fetch(`https://dashboard.cantaloupe.online${ajaxUrl}`, {
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
          body: 'draw=1&start=0&length=50'
        });

        const ajaxResponseText = await ajaxResponse.text();
        console.log('AJAX response status:', ajaxResponse.status);
        console.log('AJAX response length:', ajaxResponseText.length);

        if (ajaxResponse.ok) {
          try {
            const ajaxData = JSON.parse(ajaxResponseText);
            console.log('Successfully parsed AJAX JSON data');

            if (ajaxData.data && Array.isArray(ajaxData.data)) {
              dexData = ajaxData.data;
              totalRecords = ajaxData.recordsTotal || dexData.length;
              console.log(`Found ${dexData.length} DEX records`);
            }
          } catch (parseError) {
            console.error('Failed to parse AJAX response as JSON:', parseError.message);
            error = `AJAX parse error: ${parseError.message}`;
          }
        } else {
          error = `AJAX request failed: ${ajaxResponse.status} ${ajaxResponse.statusText}`;
          console.error(error);
        }
      } catch (ajaxError) {
        error = `AJAX request error: ${ajaxError.message}`;
        console.error(error);
      }
    } else {
      error = 'No AJAX URL found in DataTable configuration';
      console.log(error);
    }

    // Extract case serial to DEX ID mappings from the data we found
    const mappings = {};
    let validMappingsCount = 0;

    if (dexData.length > 0) {
      dexData.forEach((record, index) => {
        try {
          const devices = record.devices;
          const dexRaw = record.dexRaw;

          if (devices && devices.caseSerial && dexRaw && dexRaw.id) {
            mappings[devices.caseSerial] = {
              dexId: dexRaw.id.toString(),
              created: dexRaw.created,
              firmware: dexRaw.firmware || 'Unknown',
              parsed: dexRaw.parsed || false,
              customer: record.customers?.name || 'Unknown'
            };
            validMappingsCount++;
          }
        } catch (recordError) {
          console.error(`Error processing record ${index}:`, recordError.message);
        }
      });
    }

    console.log(`Extracted ${validMappingsCount} valid case serial to DEX ID mappings`);

    res.status(200).json({
      success: true,
      totalRecords: totalRecords,
      dataFound: dexData.length,
      validMappings: validMappingsCount,
      mappings: mappings,
      ajaxUrl: ajaxUrl,
      csrfToken: csrfToken ? csrfToken.substring(0, 10) + '...' : null,
      error: error,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('DEX mappings capture error:', error);
    res.status(500).json({
      error: 'Failed to capture DEX mappings: ' + error.message
    });
  }
}
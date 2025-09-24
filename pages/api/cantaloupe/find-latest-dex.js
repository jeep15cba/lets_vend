export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { caseSerial } = req.body;

  if (!caseSerial) {
    return res.status(400).json({ error: 'caseSerial is required' });
  }

  try {
    console.log(`Finding latest DEX for case serial: ${caseSerial}`);

    // Get cookies from request body or authenticate to get new cookies
    let cookies = req.body?.cookies;

    if (!cookies) {
      console.log('No cookies provided, authenticating for DEX search...');
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

    // Extract CSRF token
    let csrfToken = null;
    try {
      const dashResponse = await fetch('https://dashboard.cantaloupe.online/', {
        method: 'GET',
        headers: {
          'Cookie': cookies,
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36'
        }
      });

      const dashHtml = await dashResponse.text();
      const patterns = [
        /<meta\s+name="csrf-token"\s+content="([^"]+)"/i,
        /csrf[_-]?token['"]\s*:\s*['"']([^'"]+)['"]/i,
        /_token['"]\s*:\s*['"']([^'"]+)['"]/
      ];

      for (const pattern of patterns) {
        const match = dashHtml.match(pattern);
        if (match) {
          csrfToken = match[1];
          break;
        }
      }
    } catch (e) {
      console.error('Error fetching CSRF token:', e);
    }

    console.log('Searching DEX records for case serial...');

    // Form data for DEX list request - search for the specific case serial
    const formData = new URLSearchParams();
    formData.append('draw', '1');
    formData.append('start', '0');
    formData.append('length', '100'); // Get up to 100 matching records

    // Search for the case serial
    formData.append('search[value]', caseSerial);
    formData.append('search[regex]', 'false');

    // Column definitions for DEX list
    const columns = [
      'dexRaw.created',
      'devices.caseSerial',
      'customers.name',
      'dexRaw.uploadReason',
      'dexRaw.parsed',
      'dexRaw.firmware',
      'dexRaw.dexSource',
      '' // actions column
    ];

    columns.forEach((col, index) => {
      formData.append(`columns[${index}][data]`, col);
      formData.append(`columns[${index}][name]`, '');
      formData.append(`columns[${index}][searchable]`, 'true');
      formData.append(`columns[${index}][orderable]`, 'true');
      formData.append(`columns[${index}][search][value]`, '');
      formData.append(`columns[${index}][search][regex]`, 'false');
    });

    // Order by creation date descending (most recent first)
    formData.append('order[0][column]', '0');
    formData.append('order[0][dir]', 'desc');

    // This approach failed due to server error, fall back to a simpler method
    return res.status(501).json({
      error: 'Direct DEX search not implemented - server returns 500 error',
      suggestion: 'Use the main DEX list and filter client-side for now'
    });
      method: 'POST',
      headers: {
        'Cookie': cookies,
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36',
        'Accept': 'application/json, text/javascript, */*; q=0.01',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'gzip, deflate, br, zstd',
        'X-CSRF-TOKEN': csrfToken || '',
        'X-Requested-With': 'XMLHttpRequest',
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        'Origin': 'https://dashboard.cantaloupe.online',
        'Referer': 'https://dashboard.cantaloupe.online/dex',
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache',
        'Sec-CH-UA': '"Chromium";v="140", "Not=A?Brand";v="24", "Google Chrome";v="140"',
        'Sec-CH-UA-Mobile': '?0',
        'Sec-CH-UA-Platform': '"macOS"',
        'Sec-Fetch-Dest': 'empty',
        'Sec-Fetch-Mode': 'cors',
        'Sec-Fetch-Site': 'same-origin'
      },
      body: formData.toString()
    });

    const responseText = await response.text();
    console.log('DEX search response status:', response.status);

    if (!response.ok) {
      return res.status(response.status).json({
        error: `HTTP ${response.status}: ${response.statusText}`,
        rawResponse: responseText.substring(0, 1000)
      });
    }

    // Parse JSON response
    let jsonData = null;
    try {
      jsonData = JSON.parse(responseText);
    } catch (parseError) {
      return res.status(500).json({
        error: 'Failed to parse JSON response',
        parseError: parseError.message,
        rawResponse: responseText.substring(0, 1000)
      });
    }

    // Find the most recent DEX record for this case serial
    let latestDexRecord = null;
    let latestDexId = null;

    if (jsonData.data && Array.isArray(jsonData.data)) {
      // Filter for exact case serial match and get the most recent one
      const matchingRecords = jsonData.data.filter(record => {
        return record.devices && record.devices.caseSerial === caseSerial;
      });

      if (matchingRecords.length > 0) {
        // Records are already ordered by creation date descending, so first one is most recent
        latestDexRecord = matchingRecords[0];

        // Extract DEX ID from DT_RowId
        if (latestDexRecord.DT_RowId) {
          latestDexId = latestDexRecord.DT_RowId.replace('row_', '');
        } else if (latestDexRecord.dexRaw && latestDexRecord.dexRaw.id) {
          latestDexId = latestDexRecord.dexRaw.id.toString();
        }
      }
    }

    if (!latestDexRecord) {
      return res.status(404).json({
        error: `No DEX records found for case serial: ${caseSerial}`,
        caseSerial: caseSerial,
        searchResults: jsonData.recordsTotal || 0
      });
    }

    console.log(`Found latest DEX ID ${latestDexId} for case serial ${caseSerial}`);

    res.status(200).json({
      success: true,
      caseSerial: caseSerial,
      latestDexId: latestDexId,
      dexRecord: latestDexRecord,
      totalMatches: jsonData.recordsFiltered || 0,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('DEX search error:', error);
    res.status(500).json({
      error: 'Failed to find latest DEX: ' + error.message
    });
  }
}
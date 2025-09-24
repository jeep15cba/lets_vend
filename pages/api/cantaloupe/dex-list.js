export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Get cookies from request body or authenticate to get new cookies
    let cookies = req.body?.cookies;

    if (!cookies) {
      console.log('No cookies provided, authenticating for DEX list access...');
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

    console.log('Using cookies for DEX list access...');

    // Extract CSRF token from cookies
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
      console.log('Dashboard page response status:', dashResponse.status);

      // Look for CSRF token in meta tag or patterns
      const patterns = [
        /<meta\s+name="csrf-token"\s+content="([^"]+)"/i,
        /csrf[_-]?token['"]?\s*:\s*['"]([^'"]+)['"]/i,
        /_token['"]?\s*:\s*['"]([^'"]+)['"]/
      ];

      for (const pattern of patterns) {
        const match = dashHtml.match(pattern);
        if (match) {
          csrfToken = match[1];
          console.log('CSRF token found');
          break;
        }
      }
    } catch (e) {
      console.error('Error fetching dashboard page:', e);
    }

    console.log('Fetching DEX list from /dex/getData...');

    // Form data for DEX list request
    const formData = new URLSearchParams();

    // Essential DataTables parameters
    formData.append('draw', '1');
    formData.append('start', '0');
    formData.append('length', '100'); // Get first 100 DEX records

    // Search parameters
    formData.append('search[value]', '');
    formData.append('search[regex]', 'false');

    // Column definitions for DEX list (based on typical DEX table structure)
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

    console.log('Form data size:', formData.toString().length, 'bytes');

    // Make request to DEX list endpoint
    const response = await fetch('https://dashboard.cantaloupe.online/dex/getData', {
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

    console.log('DEX list response status:', response.status);
    console.log('Response content-type:', response.headers.get('content-type'));

    // Get the raw response text first
    const responseText = await response.text();
    console.log('Raw response length:', responseText.length);
    console.log('Response preview:', responseText.substring(0, 500));

    if (!response.ok) {
      return res.status(response.status).json({
        error: `HTTP ${response.status}: ${response.statusText}`,
        rawResponse: responseText,
        headers: Object.fromEntries(response.headers.entries())
      });
    }

    // Try to parse as JSON
    let jsonData = null;
    try {
      jsonData = JSON.parse(responseText);
      console.log('Successfully parsed DEX list JSON response');
      console.log('Records found:', jsonData.recordsTotal);
    } catch (parseError) {
      console.error('Failed to parse as JSON:', parseError.message);
      return res.status(200).json({
        success: true,
        type: 'text',
        rawResponse: responseText,
        parseError: parseError.message,
        timestamp: new Date().toISOString()
      });
    }

    // Return the parsed JSON data
    res.status(200).json({
      success: true,
      type: 'json',
      data: jsonData,
      responseLength: responseText.length,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('DEX list fetch error:', error);
    res.status(500).json({
      error: 'Failed to fetch DEX list: ' + error.message
    });
  }
}
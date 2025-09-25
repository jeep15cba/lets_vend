
export const runtime = 'edge';

export default async function handler(request) {
  if (request.method !== 'GET' && request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const url = new URL(request.url);

  try {
    // Get cookies from request body or authenticate to get new cookies
    let cookies;
    if (request.method === 'POST') {
      const body = await request.json().catch(() => ({}));
      cookies = body.cookies;
    }

    if (!cookies) {
      console.log('No cookies provided, authenticating for DEX raw data...');
      const authResponse = await fetch(`${request.headers.get('origin') || 'http://localhost:3300'}/api/cantaloupe/auth`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        }
      });

      const authData = await authResponse.json();

      if (!authData.success) {
        return new Response(JSON.stringify({ error: 'Authentication failed' }), {
          status: 401,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      cookies = authData.cookies;
    }

    console.log('Using cookies for raw DEX data access...');

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
        /csrf[_-]?token['"]\s*:\s*['"']([^'"]+)['"]/i,
        /_token['"]\s*:\s*['"']([^'"]+)['"]/
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

    console.log('Fetching RAW DEX data with EXACT browser form data...');

    // Use the EXACT form data from browser Network tab
    const formData = new URLSearchParams();

    // Basic DataTables parameters - get more records to find missing case serials
    const startRecord = url.searchParams.get('start') || '0';
    const recordCount = url.searchParams.get('length') || '100';
    formData.append('draw', '1');
    formData.append('start', startRecord);
    formData.append('length', recordCount);
    formData.append('search[value]', '');
    formData.append('search[regex]', 'false');

    // Column definitions - EXACT from browser
    const columns = [
      { data: '', name: '', searchable: 'false', orderable: 'false' },
      { data: '', name: '', searchable: 'false', orderable: 'false' },
      { data: 'dexRaw.created', name: '', searchable: 'true', orderable: 'true' },
      { data: 'dexRaw.parsed', name: '', searchable: 'true', orderable: 'false' },
      { data: 'dexRaw.uploadReason', name: '', searchable: 'true', orderable: 'false' },
      { data: 'dexRaw.dexSource', name: '', searchable: 'true', orderable: 'false' },
      { data: 'dexRaw.firmware', name: '', searchable: 'true', orderable: 'false' },
      { data: 'devices.caseSerial', name: '', searchable: 'true', orderable: 'false' },
      { data: 'customers.name', name: '', searchable: 'true', orderable: 'false' },
      { data: 'vdiToDEX', name: '', searchable: 'true', orderable: 'false' }
    ];

    columns.forEach((col, index) => {
      formData.append(`columns[${index}][data]`, col.data);
      formData.append(`columns[${index}][name]`, col.name);
      formData.append(`columns[${index}][searchable]`, col.searchable);
      formData.append(`columns[${index}][orderable]`, col.orderable);
      formData.append(`columns[${index}][search][value]`, '');
      formData.append(`columns[${index}][search][regex]`, 'false');
    });

    // Order by dexRaw.created descending (column 2)
    formData.append('order[0][column]', '2');
    formData.append('order[0][dir]', 'desc');

    // Date range and offset parameters from browser
    formData.append('startDateVal', '2025-09-24T03:54:00+10:00');
    formData.append('endDateVal', '2025-09-24T23:59:00+10:00');
    formData.append('offset', '600');

    console.log('Form data size:', formData.toString().length, 'bytes');

    // Make request with EXACT headers from devices-raw.js but to /dex endpoint
    const response = await fetch('https://dashboard.cantaloupe.online/dex', {
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

    console.log('Raw DEX response status:', response.status);
    console.log('Response content-type:', response.headers.get('content-type'));

    // Get the raw response text first
    const responseText = await response.text();
    console.log('Raw response length:', responseText.length);
    console.log('Response preview:', responseText.substring(0, 500));

    if (!response.ok) {
      return new Response(JSON.stringify({
        error: `HTTP ${response.status}: ${response.statusText}`,
        rawResponse: responseText,
        headers: Object.fromEntries(response.headers.entries())
      }), {
        status: response.status,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Try to parse as JSON
    let jsonData = null;
    try {
      jsonData = JSON.parse(responseText);
      console.log('Successfully parsed DEX JSON response');
      console.log('Records found:', jsonData.recordsTotal);
    } catch (parseError) {
      console.error('Failed to parse as JSON:', parseError.message);
      return new Response(JSON.stringify({
        success: true,
        type: 'text',
        rawResponse: responseText,
        parseError: parseError.message,
        timestamp: new Date().toISOString()
      }), {
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Return the parsed JSON data
    return new Response(JSON.stringify({
      success: true,
      type: 'json',
      data: jsonData,
      responseLength: responseText.length,
      timestamp: new Date().toISOString()
    }), {
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Raw DEX fetch error:', error);
    return new Response(JSON.stringify({
      error: 'Failed to fetch raw DEX data: ' + error.message
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
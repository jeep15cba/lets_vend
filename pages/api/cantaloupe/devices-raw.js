
export const runtime = 'edge';

export default async function handler(request) {
  if (request.method !== 'GET' && request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  try {
    // Get cookies from request body or authenticate to get new cookies
    let cookies;
    if (request.method === 'POST') {
      const body = await request.json().catch(() => ({}));
      cookies = body.cookies;
    }

    if (!cookies) {
      console.log('No cookies provided, authenticating for devices raw data...');
      const baseUrl = request.headers.get('origin') || process.env.NEXT_PUBLIC_SITE_URL || 'https://lets-vend.pages.dev';
      const authResponse = await fetch(`${baseUrl}/api/cantaloupe/auth`, {
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

    console.log('Using cookies for raw devices data access...');

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

    console.log('Fetching RAW devices data with exact browser headers...');

    // Use the EXACT form data from your browser request
    const formData = new URLSearchParams();

    // Essential DataTables parameters
    formData.append('draw', '1');
    formData.append('start', '0');
    formData.append('length', '100');
    formData.append('search[value]', '');
    formData.append('search[regex]', 'false');

    // Column definitions (simplified from your browser request)
    const columns = [
      'devices.caseSerial',
      'customers.name',
      'devices_location',
      'devices.lastSeen',
      'devices.firmwareStr',
      '',
      'devices.signalStr',
      'devices.temp',
      'devices.error_bits',
      'devices.uptime',
      'dexRaw.created',
      'devices.vmName',
      ''
    ];

    columns.forEach((col, index) => {
      formData.append(`columns[${index}][data]`, col);
      formData.append(`columns[${index}][name]`, '');
      formData.append(`columns[${index}][searchable]`, 'true');
      formData.append(`columns[${index}][orderable]`, 'true');
      formData.append(`columns[${index}][search][value]`, '');
      formData.append(`columns[${index}][search][regex]`, 'false');
    });

    // Order by column 3 descending (lastSeen)
    formData.append('order[0][column]', '3');
    formData.append('order[0][dir]', 'desc');

    // Additional filters
    formData.append('show_banned', 'false');
    formData.append('show_inv', 'false');
    formData.append('show_online', 'false');
    formData.append('device_type_select', '');

    console.log('Form data size:', formData.toString().length, 'bytes');

    // Make request with EXACT headers from your browser
    const response = await fetch('https://dashboard.cantaloupe.online/devices/getData', {
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
        'Referer': 'https://dashboard.cantaloupe.online/devices',
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

    console.log('Raw devices response status:', response.status);
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
      console.log('Successfully parsed JSON response');
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
    console.error('Raw devices fetch error:', error);
    return new Response(JSON.stringify({
      error: 'Failed to fetch raw devices data: ' + error.message
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
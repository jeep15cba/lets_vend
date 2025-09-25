
export const runtime = 'edge';

export default async function handler(request) {
  if (request.method !== 'GET' && request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: { "Content-Type": "application/json" } });
  }

  try {
    console.log('Authenticating for serial number capture...');
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

    const cookies = authData.cookies;

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

    console.log('Fetching ALL devices data to capture serial numbers...');

    // Form data to get ALL devices (increase length significantly)
    const formData = new URLSearchParams();
    formData.append('draw', '1');
    formData.append('start', '0');
    formData.append('length', '1000'); // Get up to 1000 devices
    formData.append('search[value]', '');
    formData.append('search[regex]', 'false');

    // Column definitions
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

    // Order by case serial ascending
    formData.append('order[0][column]', '0');
    formData.append('order[0][dir]', 'asc');

    // Additional filters
    formData.append('show_banned', 'false');
    formData.append('show_inv', 'false');
    formData.append('show_online', 'false');
    formData.append('device_type_select', '');

    // Make request to devices endpoint
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

    const responseText = await response.text();
    console.log('Devices response status:', response.status);
    console.log('Response length:', responseText.length);

    if (!response.ok) {
      return new Response(JSON.stringify({
        error: `HTTP ${response.status}: ${response.statusText}`,
        rawResponse: responseText.substring(0, 1000)
      }), { status: response.status, headers: { "Content-Type": "application/json" } });
    }

    // Parse JSON response
    let jsonData = null;
    try {
      jsonData = JSON.parse(responseText);
    } catch (parseError) {
      return new Response(JSON.stringify({
        error: 'Failed to parse JSON response',
        parseError: parseError.message,
        rawResponse: responseText.substring(0, 1000)
      }), { status: 500, headers: { "Content-Type": "application/json" } });
    }

    // Extract all unique case serials
    const caseSerials = [];
    const deviceInfo = [];

    if (jsonData.data && Array.isArray(jsonData.data)) {
      jsonData.data.forEach(deviceData => {
        const device = deviceData.devices;
        const customer = deviceData.customers;

        if (device && device.caseSerial) {
          caseSerials.push(device.caseSerial);
          deviceInfo.push({
            caseSerial: device.caseSerial,
            deviceId: device.id,
            customerName: customer?.name || 'Unknown',
            lastSeen: device.lastSeen,
            state: device.state
          });
        }
      });
    }

    // Remove duplicates and sort
    const uniqueSerials = [...new Set(caseSerials)].sort();

    console.log(`Captured ${uniqueSerials.length} unique case serials from ${jsonData.data?.length || 0} total devices`);

    return new Response(JSON.stringify({
      success: true,
      totalDevices: jsonData.data?.length || 0,
      recordsTotal: jsonData.recordsTotal || 0,
      uniqueSerials: uniqueSerials,
      deviceDetails: deviceInfo,
      serialCount: uniqueSerials.length,
      timestamp: new Date().toISOString()
    }), { headers: { "Content-Type": "application/json" } });

  } catch (error) {
    console.error('Serial capture error:', error);
    return new Response(JSON.stringify({
      error: 'Failed to capture serial numbers: ' + error.message
    }), { status: 500, headers: { "Content-Type": "application/json" } });
  }
}
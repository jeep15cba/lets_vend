
export const runtime = 'edge';

export default async function handler(request) {
  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: { "Content-Type": "application/json" } });
  }

  const body = await request.json();
  const { caseSerial } = body;

  if (!caseSerial) {
    return new Response(JSON.stringify({ error: 'caseSerial is required' }), { status: 400, headers: { "Content-Type": "application/json" } });
  }

  try {
    console.log(`Finding latest DEX for case serial: ${caseSerial}`);

    // Get cookies from request body or authenticate to get new cookies
    let cookies = body.cookies;

    if (!cookies) {
      console.log('No cookies provided, authenticating for DEX search...');
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
    return new Response(JSON.stringify({
      error: 'Direct DEX search not implemented - server returns 500 error',
      suggestion: 'Use the main DEX list and filter client-side for now'
    }), { status: 501, headers: { "Content-Type": "application/json" } });

  } catch (error) {
    console.error('DEX search error:', error);
    return new Response(JSON.stringify({
      error: 'Failed to find latest DEX: ' + error.message
    }), { status: 500, headers: { "Content-Type": "application/json" } });
  }
}
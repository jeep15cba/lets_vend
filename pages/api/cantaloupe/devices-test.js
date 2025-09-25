
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
      console.log('No cookies provided, authenticating for devices test...');
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

    // Extract CSRF token
    let csrfToken = null;
    try {
      const dashResponse = await fetch('https://dashboard.cantaloupe.online/', {
        method: 'GET',
        headers: {
          'Cookie': cookies,
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        }
      });

      const dashHtml = await dashResponse.text();
      const patterns = [
        /<meta\s+name="csrf-token"\s+content="([^"]+)"/i,
        /csrf[_-]?token['"]?\s*:\s*['"]([^'"]+)['"]/i,
        /_token['"]?\s*:\s*['"]([^'"]+)['"]/
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

    // Test different approaches
    const approaches = [
      {
        name: 'Empty body (like DEX)',
        body: ''
      },
      {
        name: 'Minimal DataTables',
        body: 'draw=1&start=0&length=10'
      },
      {
        name: 'Basic pagination',
        body: 'draw=1&start=0&length=100&search[value]=&search[regex]=false'
      }
    ];

    const results = [];

    for (const approach of approaches) {
      console.log(`Testing approach: ${approach.name}`);

      try {
        const response = await fetch('https://dashboard.cantaloupe.online/devices/getData', {
          method: 'POST',
          headers: {
            'Cookie': cookies,
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'application/json, text/javascript, */*; q=0.01',
            'Accept-Language': 'en-US,en;q=0.9',
            'X-CSRF-TOKEN': csrfToken || '',
            'X-Requested-With': 'XMLHttpRequest',
            'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
            'Referer': 'https://dashboard.cantaloupe.online/devices'
          },
          body: approach.body
        });

        const responseText = await response.text();

        results.push({
          approach: approach.name,
          status: response.status,
          statusText: response.statusText,
          contentType: response.headers.get('content-type'),
          bodyLength: approach.body.length,
          responseLength: responseText.length,
          responsePreview: responseText.substring(0, 200),
          success: response.ok
        });

        console.log(`${approach.name}: ${response.status} - ${responseText.length} bytes`);

      } catch (error) {
        results.push({
          approach: approach.name,
          error: error.message,
          success: false
        });
      }
    }

    return new Response(JSON.stringify({
      success: true,
      csrfToken: csrfToken ? csrfToken.substring(0, 10) + '...' : 'None',
      results: results,
      timestamp: new Date().toISOString()
    }), {
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Devices test error:', error);
    return new Response(JSON.stringify({
      error: 'Failed to test devices endpoints: ' + error.message
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

export const runtime = 'edge';

export default async function handler(request) {
  if (request.method !== 'GET' && request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: { "Content-Type": "application/json" } });
  }

  try {
    // Get cookies from request body or authenticate to get new cookies
    let body = {};
    if (request.method === 'POST') {
      body = await request.json().catch(() => ({}));
    }
    let cookies = body.cookies;

    if (!cookies) {
      console.log('No cookies provided, authenticating for DEX list debug...');
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

    console.log('Using cookies for DEX list debug...');

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

    console.log('Testing multiple approaches to DEX list...');

    // Try different approaches
    const approaches = [
      {
        name: 'Empty body',
        body: ''
      },
      {
        name: 'Minimal parameters',
        body: 'draw=1&start=0&length=10'
      },
      {
        name: 'Basic DataTables format',
        body: new URLSearchParams({
          'draw': '1',
          'start': '0',
          'length': '50',
          'search[value]': '',
          'search[regex]': 'false'
        }).toString()
      }
    ];

    const results = [];

    for (const approach of approaches) {
      console.log(`Testing approach: ${approach.name}`);

      try {
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
          responsePreview: responseText.substring(0, 500),
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
    }), { headers: { "Content-Type": "application/json" } });

  } catch (error) {
    console.error('DEX list debug error:', error);
    return new Response(JSON.stringify({
      error: 'Failed to debug DEX list: ' + error.message
    }), { status: 500, headers: { "Content-Type": "application/json" } });
  }
}
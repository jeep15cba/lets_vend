
export const runtime = 'edge';

// TODO: Add Supabase logging integration once auth middleware is set up
export default async function handler(request) {
  if (request.method !== 'GET' && request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const url = new URL(request.url);
  const machineId = url.searchParams.get('machineId') || process.env.CANTALOUPE_MACHINE_ID;

  if (!machineId) {
    return new Response(JSON.stringify({ error: 'Machine ID is required' }), {
      status: 400,
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
      console.log('No cookies provided, authenticating for DEX data access...');
      const authResponse = await fetch(`${request.headers.get('origin') || 'http://localhost:3000'}/api/cantaloupe/auth`, {
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

    console.log('Using cookies for DEX data access...');
    console.log('Cookies:', cookies?.substring(0, 200) + '...');

    // Extract CSRF token from cookies for DEX POST request
    let csrfToken = null;
    try {
      // Try to get CSRF token from the main dashboard page
      const dashResponse = await fetch('https://dashboard.cantaloupe.online/', {
        method: 'GET',
        headers: {
          'Cookie': cookies,
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
          'Connection': 'keep-alive'
        }
      });

      const dashHtml = await dashResponse.text();
      console.log('Dashboard page response status:', dashResponse.status);

      // Look for CSRF token in meta tag or patterns
      const metaMatch = dashHtml.match(/<meta\s+name="csrf-token"\s+content="([^"]+)"/i);
      if (metaMatch) {
        csrfToken = metaMatch[1];
        console.log('CSRF token found in meta tag:', csrfToken.substring(0, 20) + '...');
      } else {
        const patterns = [
          /name="_token"\s+value="([^"]+)"/,
          /csrf[_-]?token['"]\s*:\s*['"]([^'"]+)['"]/i,
          /_token['"]\s*:\s*['"]([^'"]+)['"]/
        ];

        for (const pattern of patterns) {
          const match = dashHtml.match(pattern);
          if (match) {
            csrfToken = match[1];
            console.log('CSRF token found with pattern:', pattern.source);
            break;
          }
        }
      }
    } catch (e) {
      console.error('Error fetching dashboard page:', e);
    }

    console.log('Fetching DEX data from /dex/getRawDex/{machineId}...');
    console.log('Machine ID:', machineId);
    console.log('CSRF Token:', csrfToken ? csrfToken.substring(0, 20) + '...' : 'None');

    const response = await fetch(`https://dashboard.cantaloupe.online/dex/getRawDex/${machineId}`, {
      method: 'POST',
      headers: {
        'Cookie': cookies,
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'X-CSRF-TOKEN': csrfToken || '',
        'X-Requested-With': 'XMLHttpRequest',
        'Referer': 'https://dashboard.cantaloupe.online/',
        'Connection': 'keep-alive',
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache'
      }
    });

    console.log('DEX data response status:', response.status);

    if (response.status === 401 || response.status === 403) {
      return new Response(JSON.stringify({ error: 'Authentication required - please check credentials' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    if (!response.ok) {
      const errorText = await response.text();
      console.error('DEX data fetch error:', response.status, response.statusText);
      console.error('Error response body:', errorText.substring(0, 500));
      console.error('Response headers:', Object.fromEntries(response.headers.entries()));
      return new Response(JSON.stringify({
        error: `Failed to fetch data: ${response.statusText}`,
        details: errorText.substring(0, 200)
      }), {
        status: response.status,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const contentType = response.headers.get('content-type') || '';

    if (contentType.includes('application/json')) {
      const data = await response.json();
      console.log('DEX data retrieved successfully (JSON format)');
      return new Response(JSON.stringify({
        success: true,
        data: data,
        type: 'json',
        machineId: machineId,
        timestamp: new Date().toISOString()
      }), {
        headers: { 'Content-Type': 'application/json' }
      });
    } else {
      const data = await response.text();
      console.log('DEX data retrieved successfully (text format), length:', data.length);
      return new Response(JSON.stringify({
        success: true,
        rawData: data,
        type: 'text',
        machineId: machineId,
        timestamp: new Date().toISOString()
      }), {
        headers: { 'Content-Type': 'application/json' }
      });
    }

  } catch (error) {
    console.error('DEX data fetch error:', error);
    return new Response(JSON.stringify({
      error: 'Failed to fetch DEX data: ' + error.message,
      machineId: machineId
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
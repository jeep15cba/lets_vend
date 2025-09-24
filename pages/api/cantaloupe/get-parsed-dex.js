
export const runtime = 'edge';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { dexId, cookies } = req.body;

  if (!dexId) {
    return res.status(400).json({ error: 'dexId is required' });
  }

  try {
    console.log(`Fetching parsed DEX data for DEX ID: ${dexId}`);

    // Get cookies from request body or authenticate to get new cookies
    let sessionCookies = cookies;

    if (!sessionCookies) {
      console.log('No cookies provided, authenticating for parsed DEX data...');
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

      sessionCookies = authData.cookies;
    }

    console.log(`Fetching parsed DEX data from: https://dashboard.cantaloupe.online/dex/getParsedDex/${dexId}`);

    // Extract CSRF token for POST request
    let csrfToken = null;
    try {
      const dashResponse = await fetch('https://dashboard.cantaloupe.online/', {
        method: 'GET',
        headers: {
          'Cookie': sessionCookies,
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
          console.log('CSRF token found for parsed DEX request');
          break;
        }
      }
    } catch (e) {
      console.error('Error fetching CSRF token:', e);
    }

    // Fetch parsed DEX data using POST method
    const response = await fetch(`https://dashboard.cantaloupe.online/dex/getParsedDex/${dexId}`, {
      method: 'POST',
      headers: {
        'Cookie': sessionCookies,
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36',
        'Accept': 'application/json, text/javascript, */*; q=0.01',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'gzip, deflate, br, zstd',
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        'Cache-Control': 'no-cache',
        'Origin': 'https://dashboard.cantaloupe.online',
        'Pragma': 'no-cache',
        'Referer': 'https://dashboard.cantaloupe.online/dex',
        'Sec-CH-UA': '"Chromium";v="140", "Not=A?Brand";v="24", "Google Chrome";v="140"',
        'Sec-CH-UA-Mobile': '?0',
        'Sec-CH-UA-Platform': '"macOS"',
        'Sec-Fetch-Dest': 'empty',
        'Sec-Fetch-Mode': 'cors',
        'Sec-Fetch-Site': 'same-origin',
        'X-CSRF-TOKEN': csrfToken || '',
        'X-Requested-With': 'XMLHttpRequest'
      },
      body: '' // Empty body for POST request
    });

    console.log('Parsed DEX response status:', response.status);
    console.log('Response content-type:', response.headers.get('content-type'));

    // Get the response text
    const responseText = await response.text();
    console.log('Response length:', responseText.length);

    if (!response.ok) {
      return res.status(response.status).json({
        success: false,
        error: `HTTP ${response.status}: ${response.statusText}`,
        rawResponse: responseText,
        dexId: dexId,
        headers: Object.fromEntries(response.headers.entries())
      });
    }

    // Try to parse as JSON (parsed DEX should be structured JSON)
    let parsedDexData = null;
    try {
      parsedDexData = JSON.parse(responseText);
      console.log('Successfully parsed DEX JSON data');
      console.log('Parsed DEX structure keys:', Object.keys(parsedDexData || {}));

      // Log some sample data to understand structure
      if (parsedDexData && typeof parsedDexData === 'object') {
        console.log('Sample parsed DEX data preview:', JSON.stringify(parsedDexData).substring(0, 200) + '...');
      }
    } catch (parseError) {
      console.error('Failed to parse response as JSON:', parseError.message);
      console.log('Raw response preview:', responseText.substring(0, 500));

      // Return raw response if parsing fails
      return res.status(200).json({
        success: true,
        type: 'text',
        dexId: dexId,
        rawResponse: responseText,
        parseError: parseError.message,
        note: 'Response could not be parsed as JSON, returning as text',
        timestamp: new Date().toISOString()
      });
    }

    // Return the structured parsed DEX data
    res.status(200).json({
      success: true,
      type: 'parsed_dex_json',
      dexId: dexId,
      data: parsedDexData,
      responseLength: responseText.length,
      structure: parsedDexData ? Object.keys(parsedDexData) : [],
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Parsed DEX fetch error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch parsed DEX data: ' + error.message,
      dexId: dexId
    });
  }
}
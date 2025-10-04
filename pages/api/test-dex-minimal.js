export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    console.log('🔧 Testing /dex endpoint with minimal DataTables format...');

    // Use environment credentials
    const siteUrl = process.env.CANTALOUPE_BASE_URL || 'https://dashboard.cantaloupe.online';

    // Step 1: Authenticate
    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3001';
    const authResponse = await fetch(`${baseUrl}/api/cantaloupe/auth`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });

    const authData = await authResponse.json();
    if (!authData.success) {
      throw new Error('Authentication failed');
    }

    const allCookies = authData.cookies;

    // Step 2: Get CSRF token
    let csrfToken = null;
    try {
      const dashResponse = await fetch(siteUrl, {
        method: 'GET',
        headers: {
          'Cookie': allCookies,
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        }
      });

      const dashHtml = await dashResponse.text();
      const patterns = [
        /<meta\s+name="csrf-token"\s+content="([^"]+)"/i,
        /csrf[_-]?token['"]\s*:\s*['"]([^'"]+)['"]/i,
        /_token['"]\s*:\s*['"]([^'"]+)['"]/
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

    console.log('CSRF token extracted:', !!csrfToken);

    // Step 3: Try progressively simpler approaches to /dex
    const strategies = [
      {
        name: 'Minimal DataTables (just draw, start, length)',
        body: new URLSearchParams({
          'draw': '1',
          'start': '0',
          'length': '10'
        }).toString()
      },
      {
        name: 'Add order parameter (column 2 desc)',
        body: new URLSearchParams({
          'draw': '1',
          'start': '0',
          'length': '10',
          'order[0][column]': '2',
          'order[0][dir]': 'desc'
        }).toString()
      },
      {
        name: 'Add search parameters',
        body: new URLSearchParams({
          'draw': '1',
          'start': '0',
          'length': '10',
          'search[value]': '',
          'search[regex]': 'false',
          'order[0][column]': '2',
          'order[0][dir]': 'desc'
        }).toString()
      },
      {
        name: 'Add minimal columns (just first 3)',
        body: new URLSearchParams({
          'draw': '1',
          'start': '0',
          'length': '10',
          'search[value]': '',
          'search[regex]': 'false',
          'order[0][column]': '2',
          'order[0][dir]': 'desc',
          'columns[0][data]': '',
          'columns[0][orderable]': 'false',
          'columns[1][data]': '',
          'columns[1][orderable]': 'false',
          'columns[2][data]': 'dexRaw.created',
          'columns[2][orderable]': 'true'
        }).toString()
      }
    ];

    const results = {};

    for (const strategy of strategies) {
      console.log(`Testing: ${strategy.name}`);

      try {
        const dexResponse = await fetch(`${siteUrl}/dex`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Cookie': allCookies,
            'X-CSRF-TOKEN': csrfToken,
            'X-Requested-With': 'XMLHttpRequest',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'application/json, text/javascript, */*; q=0.01',
            'Referer': `${siteUrl}/dex`
          },
          body: strategy.body
        });

        const responseText = await dexResponse.text();

        results[strategy.name] = {
          status: dexResponse.status,
          statusText: dexResponse.statusText,
          contentLength: responseText.length,
          preview: responseText.substring(0, 500),
          success: dexResponse.ok
        };

        // If successful, try to parse as JSON
        if (dexResponse.ok && responseText.length > 0) {
          try {
            const jsonData = JSON.parse(responseText);
            results[strategy.name].isJson = true;
            results[strategy.name].recordCount = jsonData.data ? jsonData.data.length : 0;
            results[strategy.name].totalRecords = jsonData.recordsTotal || null;

            if (jsonData.data && jsonData.data.length > 0) {
              results[strategy.name].sampleRecord = jsonData.data[0];
              console.log(`✅ SUCCESS: ${strategy.name} - Found ${jsonData.data.length} DEX records`);

              // If we found a working strategy, stop here and return the data
              return res.status(200).json({
                success: true,
                workingStrategy: strategy.name,
                dexData: jsonData,
                authenticationWorking: true,
                message: `DEX endpoint working with strategy: ${strategy.name}`,
                timestamp: new Date().toISOString()
              });
            }
          } catch (parseError) {
            results[strategy.name].isJson = false;
            results[strategy.name].parseError = parseError.message;
          }
        }

      } catch (error) {
        results[strategy.name] = {
          error: error.message,
          success: false
        };
      }

      // Add delay between requests
      await new Promise(resolve => setTimeout(resolve, 300));
    }

    return res.status(200).json({
      success: false,
      message: 'No working strategy found for DEX endpoint',
      authenticationWorking: true,
      csrfTokenFound: !!csrfToken,
      strategyResults: results,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('🔧 Test DEX minimal error:', error);
    return res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
}
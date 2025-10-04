export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    console.log('🔧 Testing /dex endpoint with different payload strategies...');

    // Use environment credentials directly
    const username = process.env.CANTALOUPE_USERNAME;
    const password = process.env.CANTALOUPE_PASSWORD;
    const siteUrl = process.env.CANTALOUPE_BASE_URL || 'https://dashboard.cantaloupe.online';

    if (!username || !password) {
      return res.status(400).json({
        error: 'Environment credentials not configured'
      });
    }

    // Step 1: Authenticate using working auth approach
    console.log('Authenticating with DEX platform...');

    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3001';
    const authResponse = await fetch(`${baseUrl}/api/cantaloupe/auth`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      }
    });

    const authData = await authResponse.json();

    if (!authData.success) {
      throw new Error('Authentication failed via auth endpoint');
    }

    const allCookies = authData.cookies;
    console.log('Authentication successful!');

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

    // Step 3: Try different strategies for /dex endpoint
    const strategies = [
      {
        name: 'Strategy 1: Empty POST',
        url: `${siteUrl}/dex`,
        method: 'POST',
        body: ''
      },
      {
        name: 'Strategy 2: Basic DataTables format (minimal)',
        url: `${siteUrl}/dex`,
        method: 'POST',
        body: new URLSearchParams({
          'draw': '1',
          'start': '0',
          'length': '10'
        }).toString()
      },
      {
        name: 'Strategy 3: DataTables with search/order',
        url: `${siteUrl}/dex`,
        method: 'POST',
        body: new URLSearchParams({
          'draw': '1',
          'start': '0',
          'length': '50',
          'search[value]': '',
          'search[regex]': 'false',
          'order[0][column]': '0',
          'order[0][dir]': 'desc'
        }).toString()
      },
      {
        name: 'Strategy 4: Copy devices structure but for DEX',
        url: `${siteUrl}/dex`,
        method: 'POST',
        body: new URLSearchParams({
          'draw': '1',
          'columns[0][data]': 'dexRaw.id',
          'columns[0][name]': 'dexId',
          'columns[0][searchable]': 'true',
          'columns[0][orderable]': 'true',
          'columns[0][search][value]': '',
          'columns[0][search][regex]': 'false',
          'columns[1][data]': 'devices.caseSerial',
          'columns[1][name]': 'caseSerial',
          'columns[1][searchable]': 'true',
          'columns[1][orderable]': 'true',
          'columns[1][search][value]': '',
          'columns[1][search][regex]': 'false',
          'columns[2][data]': 'dexRaw.created',
          'columns[2][name]': 'created',
          'columns[2][searchable]': 'true',
          'columns[2][orderable]': 'true',
          'columns[2][search][value]': '',
          'columns[2][search][regex]': 'false',
          'order[0][column]': '2',
          'order[0][dir]': 'desc',
          'start': '0',
          'length': '50',
          'search[value]': '',
          'search[regex]': 'false'
        }).toString()
      },
      {
        name: 'Strategy 5: GET request to /dex',
        url: `${siteUrl}/dex`,
        method: 'GET',
        body: null
      }
    ];

    const results = {};

    for (const strategy of strategies) {
      console.log(`Testing: ${strategy.name}`);

      try {
        const fetchOptions = {
          method: strategy.method,
          headers: {
            'Cookie': allCookies,
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'application/json, text/javascript, */*; q=0.01',
            'X-CSRF-TOKEN': csrfToken || '',
            'X-Requested-With': 'XMLHttpRequest',
            'Referer': `${siteUrl}/dex`
          }
        };

        if (strategy.method === 'POST' && strategy.body) {
          fetchOptions.headers['Content-Type'] = 'application/x-www-form-urlencoded';
          fetchOptions.body = strategy.body;
        }

        const strategyResponse = await fetch(strategy.url, fetchOptions);
        const responseText = await strategyResponse.text();

        results[strategy.name] = {
          status: strategyResponse.status,
          statusText: strategyResponse.statusText,
          contentLength: responseText.length,
          preview: responseText.substring(0, 300),
          success: strategyResponse.ok
        };

        // If successful, try to parse as JSON
        if (strategyResponse.ok && responseText.length > 0) {
          try {
            const jsonData = JSON.parse(responseText);
            results[strategy.name].isJson = true;
            results[strategy.name].recordCount = jsonData.data ? jsonData.data.length : 0;
            results[strategy.name].totalRecords = jsonData.recordsTotal || null;

            if (jsonData.data && jsonData.data.length > 0) {
              results[strategy.name].sampleRecord = jsonData.data[0];
              console.log(`✅ SUCCESS: ${strategy.name} - Found ${jsonData.data.length} DEX records`);
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
      success: true,
      authenticationWorking: true,
      csrfTokenFound: !!csrfToken,
      strategyResults: results,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('🔧 Test DEX endpoint error:', error);
    return res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
}
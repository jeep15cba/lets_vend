export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    console.log('🔧 Testing comprehensive DEX approach with environment credentials...');

    // Use environment credentials directly (no user authentication)
    const username = process.env.CANTALOUPE_USERNAME;
    const password = process.env.CANTALOUPE_PASSWORD;
    const siteUrl = process.env.CANTALOUPE_BASE_URL || 'https://dashboard.cantaloupe.online';

    if (!username || !password) {
      return res.status(400).json({
        error: 'Environment credentials not configured',
        missing: {
          username: !username,
          password: !password
        }
      });
    }

    console.log('Environment credentials found, testing authentication...');

    // Step 1: Get initial cookies from login page
    const loginPageResponse = await fetch(`${siteUrl}/login`, {
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1'
      }
    });

    if (!loginPageResponse.ok) {
      throw new Error(`Unable to reach DEX platform at ${siteUrl}: ${loginPageResponse.status}`);
    }

    const cookies = loginPageResponse.headers.get('set-cookie');
    console.log('Login page loaded successfully');

    // Step 2: Perform login
    const formData = new URLSearchParams();
    formData.append('email', username);
    formData.append('password', password);

    const loginResponse = await fetch(`${siteUrl}/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Cookie': cookies,
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Referer': `${siteUrl}/login`,
        'Origin': siteUrl,
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1'
      },
      body: formData,
      redirect: 'manual'
    });

    if (loginResponse.status !== 302) {
      throw new Error(`Authentication failed. Status: ${loginResponse.status}`);
    }

    const authCookies = loginResponse.headers.get('set-cookie');
    console.log('Authentication successful!');

    // Step 3: Combine cookies
    let allCookies = '';
    const cookieMap = new Map();

    // Parse initial cookies
    if (cookies) {
      cookies.split(',').forEach(cookie => {
        const cleaned = cookie.trim().split(';')[0];
        const [name, value] = cleaned.split('=');
        if (name && value) {
          cookieMap.set(name.trim(), value.trim());
        }
      });
    }

    // Parse auth cookies
    if (authCookies) {
      authCookies.split(',').forEach(cookie => {
        const cleaned = cookie.trim().split(';')[0];
        const [name, value] = cleaned.split('=');
        if (name && value) {
          cookieMap.set(name.trim(), value.trim());
        }
      });
    }

    allCookies = Array.from(cookieMap.entries())
      .map(([name, value]) => `${name}=${value}`)
      .join('; ');

    // Step 4: Test the comprehensive approach - try accessing /dex instead of /device/ajaxDatatable
    console.log('Testing /dex endpoint access...');

    const dexPageResponse = await fetch(`${siteUrl}/dex`, {
      method: 'GET',
      headers: {
        'Cookie': allCookies,
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Cache-Control': 'no-cache'
      }
    });

    const dexPageHtml = await dexPageResponse.text();
    console.log('DEX page response status:', dexPageResponse.status);
    console.log('DEX page HTML length:', dexPageHtml.length);

    // Step 5: Extract CSRF token using multiple patterns
    let csrfToken = null;
    const csrfPatterns = [
      /<meta\s+name="csrf-token"\s+content="([^"]+)"/i,
      /'X-CSRF-TOKEN':\s*'([^']+)'/i,
      /csrf[_-]?token['"]\s*:\s*['"']([^'"]+)['"]/i,
      /name="csrf-token"[^>]*content="([^"]*)"/i,
      /<input[^>]*name="csrf[_-]?token"[^>]*value="([^"]*)"/i
    ];

    for (const pattern of csrfPatterns) {
      const match = dexPageHtml.match(pattern);
      if (match) {
        csrfToken = match[1];
        console.log('CSRF token extracted using pattern:', pattern.source);
        break;
      }
    }

    if (!csrfToken) {
      console.log('No CSRF token found, will try without it');
    }

    // Step 6: Try multiple strategies to get DEX data
    const strategies = [
      {
        name: 'Empty POST to /dex',
        url: `${siteUrl}/dex`,
        body: ''
      },
      {
        name: 'Basic draw to /dex',
        url: `${siteUrl}/dex`,
        body: 'draw=1'
      },
      {
        name: 'Full DataTables to /dex',
        url: `${siteUrl}/dex`,
        body: new URLSearchParams({
          'draw': '1',
          'start': '0',
          'length': '50',
          'search[value]': '',
          'search[regex]': 'false'
        }).toString()
      },
      {
        name: 'Original device ajaxDatatable',
        url: `${siteUrl}/device/ajaxDatatable`,
        body: new URLSearchParams({
          'draw': '1',
          'start': '0',
          'length': '10000'
        }).toString()
      }
    ];

    let successfulData = null;
    let workingStrategy = null;
    const results = {};

    for (const strategy of strategies) {
      console.log(`Testing strategy: ${strategy.name}`);

      try {
        const strategyResponse = await fetch(strategy.url, {
          method: 'POST',
          headers: {
            'Cookie': allCookies,
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36',
            'Accept': 'application/json, text/javascript, */*; q=0.01',
            'Accept-Language': 'en-US,en;q=0.9',
            'X-CSRF-TOKEN': csrfToken || '',
            'X-Requested-With': 'XMLHttpRequest',
            'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
            'Origin': siteUrl,
            'Referer': `${siteUrl}/dex`
          },
          body: strategy.body
        });

        const strategyResponseText = await strategyResponse.text();
        console.log(`${strategy.name}: ${strategyResponse.status} (${strategyResponseText.length} bytes)`);

        results[strategy.name] = {
          status: strategyResponse.status,
          contentLength: strategyResponseText.length,
          preview: strategyResponseText.substring(0, 200)
        };

        if (strategyResponse.ok && strategyResponseText.length > 100) {
          try {
            const jsonData = JSON.parse(strategyResponseText);
            if (jsonData.data && Array.isArray(jsonData.data) && jsonData.data.length > 0) {
              successfulData = jsonData;
              workingStrategy = strategy.name;
              console.log(`SUCCESS with ${strategy.name}: Found ${jsonData.data.length} records`);
              break;
            }
          } catch (parseError) {
            console.log(`${strategy.name}: Not valid JSON or empty data`);
          }
        }

      } catch (strategyError) {
        console.error(`${strategy.name} failed:`, strategyError.message);
        results[strategy.name] = {
          error: strategyError.message
        };
      }
    }

    return res.status(200).json({
      success: true,
      authenticationWorking: true,
      dexPageAccessible: dexPageResponse.ok,
      csrfTokenFound: !!csrfToken,
      csrfToken: csrfToken ? csrfToken.substring(0, 10) + '...' : null,
      workingStrategy: workingStrategy,
      dataFound: successfulData ? successfulData.data.length : 0,
      totalRecords: successfulData?.recordsTotal || 0,
      strategyResults: results,
      sampleData: successfulData ? successfulData.data.slice(0, 2) : null,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('🔧 Test comprehensive DEX error:', error);
    return res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
}
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    console.log('Scraping DEX page for all DEX records...');

    // Get cookies from request body or authenticate to get new cookies
    let cookies = req.body?.cookies;

    if (!cookies) {
      console.log('No cookies provided, authenticating for DEX page scrape...');
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

      cookies = authData.cookies;
    }

    console.log('Fetching DEX page HTML...');

    // Fetch the DEX page directly
    const dexPageResponse = await fetch('https://dashboard.cantaloupe.online/dex', {
      method: 'GET',
      headers: {
        'Cookie': cookies,
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'gzip, deflate, br, zstd',
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache',
        'Sec-CH-UA': '"Chromium";v="140", "Not=A?Brand";v="24", "Google Chrome";v="140"',
        'Sec-CH-UA-Mobile': '?0',
        'Sec-CH-UA-Platform': '"macOS"',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'same-origin',
        'Upgrade-Insecure-Requests': '1'
      }
    });

    const dexPageHtml = await dexPageResponse.text();
    console.log('DEX page response status:', dexPageResponse.status);
    console.log('DEX page HTML length:', dexPageHtml.length);

    if (!dexPageResponse.ok) {
      return res.status(dexPageResponse.status).json({
        error: `Failed to fetch DEX page: ${dexPageResponse.status} ${dexPageResponse.statusText}`,
        htmlPreview: dexPageHtml.substring(0, 1000)
      });
    }

    // Look for JSON data embedded in the page or AJAX endpoints
    console.log('Analyzing DEX page for data sources...');

    // Look for DataTables initialization or AJAX URLs
    const ajaxUrlMatches = dexPageHtml.match(/ajax['"]\s*:\s*['"]([^'"]+)['"]/gi);
    const datatableMatches = dexPageHtml.match(/DataTable\([^)]*\)/gi);
    const scriptMatches = dexPageHtml.match(/<script[^>]*>([^<]*dex[^<]*)<\/script>/gi);

    // Look for any embedded JSON data
    const jsonMatches = dexPageHtml.match(/\{[^{}]*"dexRaw"[^{}]*\}/g);

    // Extract any URLs that might be AJAX endpoints
    const urlMatches = dexPageHtml.match(/\/[a-zA-Z\/]+\/getData[^'"''\s]*/g);

    console.log('Found potential data sources:');
    console.log('AJAX URLs:', ajaxUrlMatches?.length || 0);
    console.log('DataTable configs:', datatableMatches?.length || 0);
    console.log('Script sections:', scriptMatches?.length || 0);
    console.log('JSON matches:', jsonMatches?.length || 0);
    console.log('getData URLs:', urlMatches);

    // Try to extract CSRF token for potential AJAX calls
    let csrfToken = null;
    const patterns = [
      /<meta\s+name="csrf-token"\s+content="([^"]+)"/i,
      /csrf[_-]?token['"]\s*:\s*['"']([^'"]+)['"]/i,
      /_token['"]\s*:\s*['"']([^'"]+)['"]/
    ];

    for (const pattern of patterns) {
      const match = dexPageHtml.match(pattern);
      if (match) {
        csrfToken = match[1];
        console.log('CSRF token found in DEX page');
        break;
      }
    }

    res.status(200).json({
      success: true,
      pageStatus: dexPageResponse.status,
      pageLength: dexPageHtml.length,
      csrfToken: csrfToken ? csrfToken.substring(0, 10) + '...' : null,
      dataSources: {
        ajaxUrls: ajaxUrlMatches || [],
        datatableConfigs: datatableMatches || [],
        jsonMatches: jsonMatches ? jsonMatches.slice(0, 3) : [], // First 3 matches
        getDataUrls: urlMatches || []
      },
      htmlPreview: dexPageHtml.substring(0, 2000),
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('DEX page scrape error:', error);
    res.status(500).json({
      error: 'Failed to scrape DEX page: ' + error.message
    });
  }
}
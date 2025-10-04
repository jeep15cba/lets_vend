export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    console.log('🔧 Debug: Examining DEX page HTML structure...');

    // Use environment credentials
    const username = process.env.CANTALOUPE_USERNAME;
    const password = process.env.CANTALOUPE_PASSWORD;
    const siteUrl = process.env.CANTALOUPE_BASE_URL || 'https://dashboard.cantaloupe.online';

    if (!username || !password) {
      return res.status(400).json({ error: 'Environment credentials not configured' });
    }

    // Login process (same as before)
    const loginPageResponse = await fetch(`${siteUrl}/login`, {
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8'
      }
    });

    const cookies = loginPageResponse.headers.get('set-cookie');

    const formData = new URLSearchParams();
    formData.append('email', username);
    formData.append('password', password);

    const loginResponse = await fetch(`${siteUrl}/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Cookie': cookies,
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36',
        'Referer': `${siteUrl}/login`,
        'Origin': siteUrl
      },
      body: formData,
      redirect: 'manual'
    });

    const authCookies = loginResponse.headers.get('set-cookie');

    // Combine cookies
    let allCookies = '';
    const cookieMap = new Map();

    if (cookies) {
      cookies.split(',').forEach(cookie => {
        const cleaned = cookie.trim().split(';')[0];
        const [name, value] = cleaned.split('=');
        if (name && value) cookieMap.set(name.trim(), value.trim());
      });
    }

    if (authCookies) {
      authCookies.split(',').forEach(cookie => {
        const cleaned = cookie.trim().split(';')[0];
        const [name, value] = cleaned.split('=');
        if (name && value) cookieMap.set(name.trim(), value.trim());
      });
    }

    allCookies = Array.from(cookieMap.entries())
      .map(([name, value]) => `${name}=${value}`)
      .join('; ');

    // Get DEX page HTML
    const dexPageResponse = await fetch(`${siteUrl}/dex`, {
      method: 'GET',
      headers: {
        'Cookie': allCookies,
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8'
      }
    });

    const dexPageHtml = await dexPageResponse.text();

    // Analyze the HTML for data sources
    const analysis = {
      pageSize: dexPageHtml.length,
      hasDataTables: dexPageHtml.includes('DataTable'),
      hasDataTablesJs: dexPageHtml.includes('datatables'),
      hasAjaxUrl: dexPageHtml.includes('ajax'),
      ajaxUrls: [],
      formActions: [],
      scriptSources: [],
      embeddedData: [],
      apiEndpoints: []
    };

    // Extract AJAX URLs
    const ajaxMatches = dexPageHtml.match(/ajax['"]\s*:\s*['"]([^'"]+)['"]/gi);
    if (ajaxMatches) {
      analysis.ajaxUrls = ajaxMatches.map(match => {
        const urlMatch = match.match(/['"]([^'"]+)['"]$/);
        return urlMatch ? urlMatch[1] : match;
      });
    }

    // Extract form actions
    const formMatches = dexPageHtml.match(/<form[^>]*action=['"]([^'"]+)['"]/gi);
    if (formMatches) {
      analysis.formActions = formMatches.map(match => {
        const actionMatch = match.match(/action=['"]([^'"]+)['"]/);
        return actionMatch ? actionMatch[1] : match;
      });
    }

    // Extract script sources
    const scriptMatches = dexPageHtml.match(/<script[^>]*src=['"]([^'"]+)['"]/gi);
    if (scriptMatches) {
      analysis.scriptSources = scriptMatches.map(match => {
        const srcMatch = match.match(/src=['"]([^'"]+)['"]/);
        return srcMatch ? srcMatch[1] : match;
      });
    }

    // Look for potential API endpoints in JavaScript
    const apiMatches = dexPageHtml.match(/['"][^'"]*\/api\/[^'"]+['"]/gi);
    if (apiMatches) {
      analysis.apiEndpoints = [...new Set(apiMatches.map(match => match.replace(/['"]/g, '')))];
    }

    // Look for fetch() calls
    const fetchMatches = dexPageHtml.match(/fetch\s*\(\s*['"][^'"]+['"]/gi);
    if (fetchMatches) {
      analysis.fetchUrls = fetchMatches.map(match => {
        const urlMatch = match.match(/['"]([^'"]+)['"]/);
        return urlMatch ? urlMatch[1] : match;
      });
    }

    // Look for embedded JSON data
    const jsonMatches = dexPageHtml.match(/\{[^{}]*"dex[^}]*\}/gi);
    if (jsonMatches) {
      analysis.embeddedData = jsonMatches.slice(0, 3); // Just first 3 to avoid too much data
    }

    // Look for table initialization
    const tableMatches = dexPageHtml.match(/#[a-zA-Z0-9_-]+.*\.DataTable\s*\(/gi);
    if (tableMatches) {
      analysis.tableInits = tableMatches;
    }

    // Extract any URLs that look like data endpoints
    const urlMatches = dexPageHtml.match(/['"][^'"]*(?:data|ajax|api|dex|device)[^'"]*['"]/gi);
    if (urlMatches) {
      analysis.potentialEndpoints = [...new Set(urlMatches.map(match => match.replace(/['"]/g, '')))];
    }

    return res.status(200).json({
      success: true,
      analysis: analysis,
      htmlPreview: dexPageHtml.substring(0, 2000),
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('🔧 Debug DEX page error:', error);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
}
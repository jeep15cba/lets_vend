export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    console.log('🔧 Analyzing DEX page HTML to find AJAX endpoints...');

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

    // Step 2: Get DEX page HTML
    const dexPageResponse = await fetch(`${siteUrl}/dex`, {
      method: 'GET',
      headers: {
        'Cookie': allCookies,
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    });

    const dexPageHtml = await dexPageResponse.text();

    // Step 3: Analyze HTML for AJAX endpoints and DataTables configuration
    const analysis = {
      pageSize: dexPageHtml.length,
      endpoints: [],
      dataTables: [],
      ajaxUrls: [],
      formActions: []
    };

    // Look for AJAX URLs
    const ajaxPatterns = [
      /ajax['"]\s*:\s*['"]([^'"]+)['"]/gi,
      /url['"]\s*:\s*['"]([^'"]*dex[^'"]*)['"]/gi,
      /"([^"]*\/dex\/[^"]+)"/gi,
      /'([^']*\/dex\/[^']+)'/gi
    ];

    ajaxPatterns.forEach(pattern => {
      const matches = dexPageHtml.match(pattern);
      if (matches) {
        matches.forEach(match => {
          const urlMatch = match.match(/['"]([^'"]+)['"]/);
          if (urlMatch) {
            analysis.ajaxUrls.push(urlMatch[1]);
          }
        });
      }
    });

    // Look for DataTables initialization
    const dataTableMatches = dexPageHtml.match(/#[a-zA-Z0-9_-]+.*\.DataTable\s*\([^)]*\)/gi);
    if (dataTableMatches) {
      analysis.dataTables = dataTableMatches;
    }

    // Look for form actions
    const formMatches = dexPageHtml.match(/<form[^>]*action=['""]([^'""]+)['""]/gi);
    if (formMatches) {
      formMatches.forEach(match => {
        const actionMatch = match.match(/action=['""]([^'""]+)['"]/);
        if (actionMatch) {
          analysis.formActions.push(actionMatch[1]);
        }
      });
    }

    // Look for specific DEX-related endpoints in JavaScript
    const jsEndpointPatterns = [
      /['"]([^'"]*dex[^'"]*getData[^'"]*)['"]/gi,
      /['"]([^'"]*dex[^'"]*ajax[^'"]*)['"]/gi,
      /['"]([^'"]*ajax[^'"]*dex[^'"]*)['"]/gi,
      /route\s*\(\s*['"]([^'"]*dex[^'"]*)['"]/gi
    ];

    jsEndpointPatterns.forEach(pattern => {
      const matches = dexPageHtml.match(pattern);
      if (matches) {
        matches.forEach(match => {
          const endpointMatch = match.match(/['"]([^'"]+)['"]/);
          if (endpointMatch) {
            analysis.endpoints.push(endpointMatch[1]);
          }
        });
      }
    });

    // Remove duplicates and clean up
    analysis.ajaxUrls = [...new Set(analysis.ajaxUrls)];
    analysis.endpoints = [...new Set(analysis.endpoints)];
    analysis.formActions = [...new Set(analysis.formActions)];

    // Look for column definitions (similar to devices structure)
    const columnMatches = dexPageHtml.match(/columns\s*:\s*\[[^\]]+\]/gi);
    if (columnMatches) {
      analysis.columnDefinitions = columnMatches.slice(0, 2); // Just first 2 to avoid too much data
    }

    // Extract DataTables configuration blocks
    const dataTableConfigMatches = dexPageHtml.match(/\.DataTable\s*\(\s*\{[^}]*\}/gi);
    if (dataTableConfigMatches) {
      analysis.dataTableConfigs = dataTableConfigMatches.slice(0, 2);
    }

    return res.status(200).json({
      success: true,
      analysis: analysis,
      potentialEndpoints: analysis.endpoints.filter(e => e.includes('dex')),
      likelyAjaxUrls: analysis.ajaxUrls.filter(url =>
        url.includes('dex') || url.includes('ajax') || url.includes('getData')
      ),
      htmlPreview: dexPageHtml.substring(0, 1000),
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('🔧 Analyze DEX page error:', error);
    return res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
}
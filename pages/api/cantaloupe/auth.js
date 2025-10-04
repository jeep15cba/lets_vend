
import { getUserDexCredentials } from '../../../lib/user-credentials'

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Get user-specific DEX credentials
  const credentials = await getUserDexCredentials(req);

  console.log('Credentials check:', {
    isConfigured: credentials.isConfigured,
    hasUsername: !!credentials.username,
    hasPassword: !!credentials.password,
    siteUrl: credentials.siteUrl,
    error: credentials.error
  });

  if (!credentials.isConfigured || !credentials.username || !credentials.password) {
    return res.status(400).json({
      error: credentials.error || 'DEX credentials not configured',
      needsConfiguration: true
    });
  }

  const { username, password, siteUrl } = credentials;

  try {
    console.log('Starting authentication process...');

    // Get initial cookies from login page
    const loginPageResponse = await fetch(`${siteUrl}/login`, {
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1'
      }
    });

    const cookies = loginPageResponse.headers.get('set-cookie');
    console.log('Login page loaded, performing login...');

    // Perform login (no CSRF token needed for this form)
    const formData = new URLSearchParams();
    formData.append('email', username);
    formData.append('password', password);

    const loginResponse = await fetch(`${siteUrl}/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Cookie': cookies,
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Referer': `${siteUrl}/login`,
        'Origin': siteUrl,
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1'
      },
      body: formData,
      redirect: 'manual'
    });

    const authCookies = loginResponse.headers.get('set-cookie');
    console.log('Login response status:', loginResponse.status);
    console.log('Initial cookies from login page:', cookies?.substring(0, 200) + '...');
    console.log('Auth cookies from login response:', authCookies?.substring(0, 200) + '...');

    // Check redirect location to verify successful login
    const redirectLocation = loginResponse.headers.get('location')
    console.log('Redirect location:', redirectLocation)

    if (loginResponse.status === 302 && redirectLocation && !redirectLocation.includes('/login')) {
      console.log('Authentication successful - redirected to:', redirectLocation);

      // Combine initial cookies with auth cookies
      let allCookies = '';
      const cookieMap = new Map();

      // Parse initial cookies (from login page)
      if (cookies) {
        cookies.split(',').forEach(cookie => {
          const cleaned = cookie.trim().split(';')[0];
          const [name, value] = cleaned.split('=');
          if (name && value) {
            cookieMap.set(name.trim(), value.trim());
          }
        });
      }

      // Parse auth cookies (from login response) - these override initial cookies
      if (authCookies) {
        authCookies.split(',').forEach(cookie => {
          const cleaned = cookie.trim().split(';')[0];
          const [name, value] = cleaned.split('=');
          if (name && value) {
            cookieMap.set(name.trim(), value.trim());
          }
        });
      }

      // Create final cookie string
      allCookies = Array.from(cookieMap.entries())
        .map(([name, value]) => `${name}=${value}`)
        .join('; ');

      console.log('Final combined cookies:', allCookies?.substring(0, 200) + '...');

      return res.status(200).json({
        success: true,
        cookies: allCookies,
        message: 'Authentication successful'
      });
    } else {
      console.error('Authentication failed, status:', loginResponse.status);
      console.error('Redirect location indicates failure:', redirectLocation);
      const responseText = await loginResponse.text();
      console.error('Response body:', responseText.substring(0, 200));
      return res.status(401).json({
        error: 'Authentication failed',
        details: {
          status: loginResponse.status,
          redirectLocation,
          bodyPreview: responseText.substring(0, 200)
        }
      });
    }

  } catch (error) {
    console.error('Auth error:', error);
    return res.status(500).json({ error: 'Authentication error: ' + error.message });
  }
}

export const runtime = 'edge';

export default async function handler(request) {
  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const username = process.env.CANTALOUPE_USERNAME;
  const password = process.env.CANTALOUPE_PASSWORD;

  console.log('Environment check:', {
    hasUsername: !!username,
    hasPassword: !!password,
    usernameLength: username ? username.length : 0,
    environment: process.env.NODE_ENV,
    hasSiteUrl: !!process.env.NEXT_PUBLIC_SITE_URL,
    origin: request.headers.get('origin')
  });

  if (!username || !password) {
    return new Response(JSON.stringify({
      error: 'Missing credentials in environment variables',
      debug: {
        hasUsername: !!username,
        hasPassword: !!password,
        environment: process.env.NODE_ENV
      }
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  try {
    console.log('Starting authentication process...');

    // Get initial cookies from login page
    const loginPageResponse = await fetch('https://dashboard.cantaloupe.online/login', {
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

    const loginResponse = await fetch('https://dashboard.cantaloupe.online/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Cookie': cookies,
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Referer': 'https://dashboard.cantaloupe.online/login',
        'Origin': 'https://dashboard.cantaloupe.online',
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

    if (loginResponse.status === 302) {
      console.log('Authentication successful');

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

      return new Response(JSON.stringify({
        success: true,
        cookies: allCookies,
        message: 'Authentication successful'
      }), {
        headers: { 'Content-Type': 'application/json' }
      });
    } else {
      console.error('Authentication failed, status:', loginResponse.status);
      const responseText = await loginResponse.text();
      console.error('Response body:', responseText.substring(0, 200));
      return new Response(JSON.stringify({ error: 'Authentication failed' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }

  } catch (error) {
    console.error('Auth error:', error);
    return new Response(JSON.stringify({ error: 'Authentication error: ' + error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
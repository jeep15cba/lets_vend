export const runtime = 'edge';

export default async function handler(request) {
  try {
    // Get credentials from environment variables
    const username = process.env.CANTALOUPE_USERNAME;
    const password = process.env.CANTALOUPE_PASSWORD;

    console.log('Testing authentication with environment credentials...');

    // Test authentication flow
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
    console.log('Login page response:', loginPageResponse.status);

    if (!loginPageResponse.ok) {
      return new Response(JSON.stringify({
        success: false,
        error: 'Failed to load login page',
        status: loginPageResponse.status
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Perform login
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

    console.log('Login response:', loginResponse.status);

    return new Response(JSON.stringify({
      success: true,
      message: 'Authentication test completed',
      results: {
        loginPageStatus: loginPageResponse.status,
        loginResponseStatus: loginResponse.status,
        authSuccess: loginResponse.status === 302,
        hasCookies: !!cookies,
        timestamp: new Date().toISOString()
      }
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Authentication test error:', error);
    return new Response(JSON.stringify({
      success: false,
      error: 'Authentication test failed',
      message: error.message,
      timestamp: new Date().toISOString()
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
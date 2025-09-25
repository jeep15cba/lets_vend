export const runtime = 'edge';

export default function handler(request) {
  // Only test environment variable access, no actual authentication
  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  try {
    const username = process.env.CANTALOUPE_USERNAME;
    const password = process.env.CANTALOUPE_PASSWORD;

    if (!username || !password) {
      return new Response(JSON.stringify({
        error: 'Missing credentials in environment variables',
        debug: {
          hasUsername: !!username,
          hasPassword: !!password,
          usernameLength: username ? username.length : 0,
          passwordLength: password ? password.length : 0
        }
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Return success without doing actual authentication
    return new Response(JSON.stringify({
      success: true,
      message: 'Environment variables accessible',
      debug: {
        usernameLength: username.length,
        passwordLength: password.length,
        usernamePreview: username.substring(0, 5) + '...',
        timestamp: new Date().toISOString()
      }
    }), {
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    return new Response(JSON.stringify({
      error: 'Environment variable access failed',
      message: error.message
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
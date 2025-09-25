export const runtime = 'edge';

export default async function handler(request) {
  if (request.method !== 'GET') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  try {
    // Test basic functionality first
    const basicInfo = {
      success: true,
      timestamp: new Date().toISOString(),
      runtime: 'edge'
    };

    // Try to access environment variables safely
    let envCheck = {};
    try {
      envCheck = {
        hasCantaloupeUsername: !!process.env.CANTALOUPE_USERNAME,
        hasCantaloupePassword: !!process.env.CANTALOUPE_PASSWORD,
        hasCantaloupeMachineId: !!process.env.CANTALOUPE_MACHINE_ID,
        hasSiteUrl: !!process.env.NEXT_PUBLIC_SITE_URL,
        siteUrl: process.env.NEXT_PUBLIC_SITE_URL || 'not-set',
        nodeEnv: process.env.NODE_ENV || 'unknown',
        origin: request.headers?.get('origin') || 'no-origin'
      };
    } catch (envError) {
      envCheck = {
        error: 'Cannot access process.env: ' + envError.message
      };
    }

    return new Response(JSON.stringify({
      ...basicInfo,
      environment: envCheck
    }), {
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    return new Response(JSON.stringify({
      error: 'Environment test failed: ' + error.message,
      stack: error.stack
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
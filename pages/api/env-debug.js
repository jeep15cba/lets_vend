export const runtime = 'edge';

export default function handler(request) {
  try {
    // Test if we can access process at all
    const processExists = typeof process !== 'undefined';

    // Test if we can access process.env
    let envExists = false;
    let envKeys = [];
    let specificVars = {};

    try {
      envExists = typeof process.env !== 'undefined';
      if (envExists) {
        // Get all environment variable keys (don't expose values)
        envKeys = Object.keys(process.env);

        // Test specific variables we need
        specificVars = {
          CANTALOUPE_USERNAME: {
            exists: 'CANTALOUPE_USERNAME' in process.env,
            hasValue: !!process.env.CANTALOUPE_USERNAME,
            length: process.env.CANTALOUPE_USERNAME ? process.env.CANTALOUPE_USERNAME.length : 0
          },
          CANTALOUPE_PASSWORD: {
            exists: 'CANTALOUPE_PASSWORD' in process.env,
            hasValue: !!process.env.CANTALOUPE_PASSWORD,
            length: process.env.CANTALOUPE_PASSWORD ? process.env.CANTALOUPE_PASSWORD.length : 0
          },
          CANTALOUPE_MACHINE_ID: {
            exists: 'CANTALOUPE_MACHINE_ID' in process.env,
            hasValue: !!process.env.CANTALOUPE_MACHINE_ID,
            length: process.env.CANTALOUPE_MACHINE_ID ? process.env.CANTALOUPE_MACHINE_ID.length : 0
          },
          NEXT_PUBLIC_SITE_URL: {
            exists: 'NEXT_PUBLIC_SITE_URL' in process.env,
            hasValue: !!process.env.NEXT_PUBLIC_SITE_URL,
            value: process.env.NEXT_PUBLIC_SITE_URL // Safe to expose this one
          },
          NODE_ENV: {
            exists: 'NODE_ENV' in process.env,
            hasValue: !!process.env.NODE_ENV,
            value: process.env.NODE_ENV
          }
        };
      }
    } catch (envError) {
      return new Response(JSON.stringify({
        success: false,
        error: 'Failed to access process.env',
        details: envError.message,
        processExists,
        envExists: false
      }), {
        headers: { 'Content-Type': 'application/json' }
      });
    }

    return new Response(JSON.stringify({
      success: true,
      runtime: 'edge',
      timestamp: new Date().toISOString(),
      environment: {
        processExists,
        envExists,
        totalEnvVars: envKeys.length,
        envKeysPreview: envKeys.slice(0, 10), // First 10 keys only
        specificVariables: specificVars
      }
    }), {
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    return new Response(JSON.stringify({
      success: false,
      error: 'Environment debug failed',
      message: error.message,
      stack: error.stack
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
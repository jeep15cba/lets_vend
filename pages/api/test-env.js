export const runtime = 'edge';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
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
        origin: req.headers?.origin || 'no-origin'
      };
    } catch (envError) {
      envCheck = {
        error: 'Cannot access process.env: ' + envError.message
      };
    }

    return res.status(200).json({
      ...basicInfo,
      environment: envCheck
    });

  } catch (error) {
    return res.status(500).json({
      error: 'Environment test failed: ' + error.message,
      stack: error.stack
    });
  }
}
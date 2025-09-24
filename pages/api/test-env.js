export const runtime = 'edge';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const envCheck = {
      hasCantaloupeUsername: !!process.env.CANTALOUPE_USERNAME,
      hasCantaloupePassword: !!process.env.CANTALOUPE_PASSWORD,
      hasCantaloupeMachineId: !!process.env.CANTALOUPE_MACHINE_ID,
      nodeEnv: process.env.NODE_ENV,
      timestamp: new Date().toISOString(),
      runtime: 'edge'
    };

    // Don't expose actual values, just check presence
    console.log('Environment variables check:', envCheck);

    res.status(200).json({
      success: true,
      environment: envCheck
    });

  } catch (error) {
    console.error('Environment test error:', error);
    res.status(500).json({
      error: 'Environment test failed: ' + error.message
    });
  }
}
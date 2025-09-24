
export const runtime = 'edge';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Edge Runtime doesn't support fs module, so this endpoint is disabled in production
    res.status(501).json({
      error: 'DEX mapping validation is not available in Edge Runtime (Cloudflare Pages)',
      note: 'This endpoint requires file system access which is not supported in serverless Edge Runtime',
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Mapping validation error:', error);
    res.status(500).json({
      error: 'Failed to validate mappings: ' + error.message
    });
  }
}
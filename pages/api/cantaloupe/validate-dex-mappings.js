
export const runtime = 'edge';

export default async function handler(request) {
  if (request.method !== 'GET') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: { "Content-Type": "application/json" } });
  }

  try {
    // Edge Runtime doesn't support fs module, so this endpoint is disabled in production
    return new Response(JSON.stringify({
      error: 'DEX mapping validation is not available in Edge Runtime (Cloudflare Pages)',
      note: 'This endpoint requires file system access which is not supported in serverless Edge Runtime',
      timestamp: new Date().toISOString()
    }), {
      status: 501,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Mapping validation error:', error);
    return new Response(JSON.stringify({
      error: 'Failed to validate mappings: ' + error.message
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
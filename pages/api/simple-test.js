export const runtime = 'edge';

export default async function handler(request) {
  try {
    return new Response(JSON.stringify({
      success: true,
      message: 'Edge Runtime is working',
      timestamp: new Date().toISOString()
    }), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    return new Response(JSON.stringify({
      error: 'Simple test failed: ' + error.message
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
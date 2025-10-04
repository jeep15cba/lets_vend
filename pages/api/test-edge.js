export const runtime = 'edge'

export default async function handler(req) {
  return new Response(JSON.stringify({
    success: true,
    message: 'Edge Runtime is working!',
    timestamp: new Date().toISOString(),
    url: req.url,
    method: req.method
  }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  })
}

export const runtime = 'edge';

export default async function handler() {
  return new Response(JSON.stringify({ status: 'working' }), {
    headers: { 'Content-Type': 'application/json' }
  });
}
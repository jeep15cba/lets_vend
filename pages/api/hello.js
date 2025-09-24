export const runtime = 'edge';

// Absolute minimal API route for testing
export default async function handler() {
  return new Response(JSON.stringify({ message: 'Hello from API' }), {
    headers: { 'Content-Type': 'application/json' }
  });
}
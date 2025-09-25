export const runtime = 'edge';

export default async function handler(request) {
  // This endpoint is not used - using static data from public/data/ instead
  return new Response(JSON.stringify({
    error: 'Machines endpoint not implemented - using static data from public/data/',
    note: 'This app uses static data files and live Cantaloupe API calls instead of a database'
  }), {
    status: 501,
    headers: { 'Content-Type': 'application/json' }
  });
}
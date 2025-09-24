export const runtime = 'edge';

export default async function handler(req, res) {
  // This endpoint is not used - using static data from public/data/ instead
  return res.status(501).json({
    error: 'DEX logs endpoint not implemented - using static data from public/data/',
    note: 'This app uses static data files and live Cantaloupe API calls instead of a database'
  });
}
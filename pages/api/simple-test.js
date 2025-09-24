export const runtime = 'edge';

export default async function handler(req, res) {
  try {
    return res.status(200).json({
      success: true,
      message: 'Edge Runtime is working',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    return res.status(500).json({
      error: 'Simple test failed: ' + error.message
    });
  }
}
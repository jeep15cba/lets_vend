// No Edge Runtime - use Node.js runtime
export default async function handler(req, res) {
  try {
    return res.status(200).json({
      success: true,
      message: 'Node.js runtime is working',
      timestamp: new Date().toISOString(),
      runtime: 'nodejs'
    });
  } catch (error) {
    return res.status(500).json({
      error: 'Basic test failed: ' + error.message
    });
  }
}
export const runtime = 'edge';

export default function handler(req, res) {
  // Only test environment variable access, no actual authentication
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const username = process.env.CANTALOUPE_USERNAME;
    const password = process.env.CANTALOUPE_PASSWORD;

    if (!username || !password) {
      return res.status(400).json({
        error: 'Missing credentials in environment variables',
        debug: {
          hasUsername: !!username,
          hasPassword: !!password,
          usernameLength: username ? username.length : 0,
          passwordLength: password ? password.length : 0
        }
      });
    }

    // Return success without doing actual authentication
    return res.status(200).json({
      success: true,
      message: 'Environment variables accessible',
      debug: {
        usernameLength: username.length,
        passwordLength: password.length,
        usernamePreview: username.substring(0, 5) + '...',
        timestamp: new Date().toISOString()
      }
    });

  } catch (error) {
    return res.status(500).json({
      error: 'Environment variable access failed',
      message: error.message
    });
  }
}
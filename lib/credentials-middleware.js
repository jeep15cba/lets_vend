import { getUserDexCredentials } from './user-credentials'

/**
 * Middleware to check if user has valid credentials before API access
 * Returns early response if credentials are missing or invalid
 */
export async function requireCredentials(req, res, next) {
  try {
    const credentials = await getUserDexCredentials(req)

    if (!credentials.isConfigured) {
      return res.status(400).json({
        error: 'Credentials not configured',
        needsCredentials: true,
        message: 'Please configure your DEX credentials in Settings before accessing this feature.'
      })
    }

    // Add credentials to request for use in the route
    req.dexCredentials = credentials

    // If next is provided (for use as middleware), call it
    if (typeof next === 'function') {
      return next()
    }

    // Return credentials for direct usage
    return credentials
  } catch (error) {
    console.error('Credentials middleware error:', error)
    return res.status(500).json({
      error: 'Failed to verify credentials',
      needsCredentials: true
    })
  }
}

/**
 * Helper to check credentials status without failing the request
 * Useful for conditional UI rendering
 */
export async function checkCredentialsStatus(req) {
  try {
    const credentials = await getUserDexCredentials(req)
    return {
      hasCredentials: credentials.isConfigured,
      validationStatus: credentials.isConfigured ? 'valid' : 'missing',
      siteUrl: credentials.siteUrl
    }
  } catch (error) {
    console.error('Error checking credentials status:', error)
    return {
      hasCredentials: false,
      validationStatus: 'error',
      siteUrl: null
    }
  }
}
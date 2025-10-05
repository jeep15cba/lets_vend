import { decrypt } from './encryption'
import { getUserCompanyContext, createClient } from './supabase/server'
import { createServiceClient } from './supabase/service'

export async function getUserDexCredentials(req) {
  try {
    // Get user context with real auth
    const { user, companyId, role, error: authError } = await getUserCompanyContext(req)

    if (authError || !user) {
      return {
        username: null,
        password: null,
        siteUrl: 'https://dashboard.cantaloupe.online',
        isConfigured: false,
        error: 'Authentication required'
      }
    }

    const userId = user.id

    // Fetch from Supabase user_credentials table with RLS
    const { supabase } = createClient(req)

    const { data, error } = await supabase
      .from('user_credentials')
      .select('username_encrypted, password_encrypted, site_url')
      .eq('user_id', userId)
      .single()

    if (error && error.code !== 'PGRST116') { // PGRST116 = row not found
      throw error
    }

    if (data) {
      return {
        username: await decrypt(data.username_encrypted),
        password: await decrypt(data.password_encrypted),
        siteUrl: data.site_url || 'https://dashboard.cantaloupe.online',
        isConfigured: true
      }
    }

    // No fallback - user must have configured credentials
    return {
      username: null,
      password: null,
      siteUrl: 'https://dashboard.cantaloupe.online',
      isConfigured: false,
      error: 'No DEX credentials configured for user. Please configure your Cantaloupe credentials in settings.'
    }

  } catch (error) {
    console.error('Error fetching user DEX credentials:', error)
    return {
      username: null,
      password: null,
      siteUrl: 'https://dashboard.cantaloupe.online',
      isConfigured: false,
      error: 'Failed to fetch user credentials'
    }
  }
}

/**
 * Get DEX credentials by company ID (for service-level auth)
 * Uses service role client to bypass RLS
 */
export async function getDexCredentialsByCompanyId(companyId) {
  try {
    // Use service role client (bypasses RLS)
    const supabase = createServiceClient()

    const { data, error } = await supabase
      .from('user_credentials')
      .select('username_encrypted, password_encrypted, site_url')
      .eq('company_id', companyId)
      .limit(1)
      .single()

    if (error && error.code !== 'PGRST116') { // PGRST116 = row not found
      throw error
    }

    if (data) {
      return {
        username: await decrypt(data.username_encrypted),
        password: await decrypt(data.password_encrypted),
        siteUrl: data.site_url || 'https://dashboard.cantaloupe.online',
        isConfigured: true
      }
    }

    return {
      username: null,
      password: null,
      siteUrl: 'https://dashboard.cantaloupe.online',
      isConfigured: false,
      error: 'No DEX credentials configured for company'
    }

  } catch (error) {
    console.error('Error fetching company DEX credentials:', error)
    return {
      username: null,
      password: null,
      siteUrl: 'https://dashboard.cantaloupe.online',
      isConfigured: false,
      error: 'Failed to fetch company credentials'
    }
  }
}
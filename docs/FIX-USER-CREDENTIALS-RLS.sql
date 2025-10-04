-- =============================================================================
-- FIX USER CREDENTIALS RLS POLICY
-- Execute this SQL in your Supabase SQL Editor to fix user_credentials access
-- =============================================================================

-- Drop the existing restrictive policy
DROP POLICY IF EXISTS "credentials_user_access" ON user_credentials;

-- Create a new policy that allows access based on company_id matching
-- This matches the pattern we used for the companies table
CREATE POLICY "user_credentials_company_access" ON user_credentials
  FOR ALL USING (
    -- Allow access if user's company_id in JWT matches the record's company_id
    (auth.jwt() ->> 'app_metadata')::jsonb ->> 'company_id' = company_id::text
    OR
    -- Also allow admin role access
    auth.jwt() ->> 'role' = 'admin'
    OR
    -- Allow service role (for server-side operations)
    auth.jwt() ->> 'role' = 'service_role'
  );

-- =============================================================================
-- VERIFICATION QUERIES
-- =============================================================================

-- Check if the new policy was created
SELECT policyname, tablename, cmd, qual
FROM pg_policies
WHERE tablename = 'user_credentials';

-- Test the policy by checking current user's access
-- This should return the user's credentials if the policy works
SELECT id, user_id, company_id, site_url, is_active, validation_status
FROM user_credentials
WHERE user_id = auth.uid()
LIMIT 1;

-- =============================================================================
-- NOTES
-- =============================================================================

-- 1. This policy allows users to access user_credentials records where their
--    JWT app_metadata.company_id matches the record's company_id
-- 2. This is consistent with the companies table RLS policy pattern
-- 3. Admin and service_role users maintain full access
-- 4. The policy enables company-scoped access to credentials
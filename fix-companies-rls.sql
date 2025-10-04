-- Fix companies RLS policy to use user_credentials table instead of JWT metadata
-- This eliminates the JWT sync issues we've been experiencing

-- Drop the existing problematic policy
DROP POLICY IF EXISTS "company_access" ON companies;

-- Create new policy using user_credentials table lookup
CREATE POLICY "company_access" ON companies
FOR ALL
TO public
USING (
  -- Admins can see all companies
  ((auth.jwt() ->> 'role'::text) = 'admin'::text)
  OR
  -- Regular users can see their company via user_credentials table
  (id IN (
    SELECT company_id
    FROM user_credentials
    WHERE user_id = auth.uid()
      AND company_id IS NOT NULL
  ))
);

-- Test the new policy
-- This should now work reliably without JWT metadata issues
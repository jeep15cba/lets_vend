-- Add RLS policy to allow admins to read all companies
-- This allows admins to see all companies for impersonation and management

-- Policy: Allow admins to SELECT all companies
CREATE POLICY "Admins can view all companies"
ON companies
FOR SELECT
TO authenticated
USING (
  (auth.jwt()->>'user_metadata')::jsonb->>'role' = 'admin'
  OR
  (auth.jwt()->>'app_metadata')::jsonb->>'role' = 'admin'
);

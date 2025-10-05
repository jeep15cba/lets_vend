-- Add RLS policy to allow admins to read all user_credentials records
-- This allows admins to see which companies have DEX credentials configured
-- Admins can only READ, not modify

-- Policy: Allow admins to SELECT all user_credentials
CREATE POLICY "Admins can view all user credentials"
ON user_credentials
FOR SELECT
TO authenticated
USING (
  (auth.jwt()->>'user_metadata')::jsonb->>'role' = 'admin'
  OR
  (auth.jwt()->>'app_metadata')::jsonb->>'role' = 'admin'
);

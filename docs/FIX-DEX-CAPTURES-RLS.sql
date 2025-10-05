-- Fix RLS policy for dex_captures table to properly check user's company_id
-- The issue: auth.jwt() ->> 'company_id' doesn't exist in Supabase JWTs
-- Solution: Check user's company_id from user_credentials table

DROP POLICY IF EXISTS "dex_company_access" ON dex_captures;

CREATE POLICY "dex_company_access" ON dex_captures
  FOR ALL USING (
    -- Check if the dex_capture's company_id matches the user's company_id from user_credentials
    company_id IN (
      SELECT company_id FROM user_credentials
      WHERE user_id = auth.uid()
    )
    OR
    -- Allow if the machine_id belongs to a machine in the user's company
    machine_id IN (
      SELECT m.id FROM machines m
      JOIN user_credentials uc ON m.company_id = uc.company_id
      WHERE uc.user_id = auth.uid()
    )
  );

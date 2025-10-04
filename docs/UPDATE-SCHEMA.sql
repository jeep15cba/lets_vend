-- =============================================================================
-- SCHEMA UPDATE SCRIPT - Add User Credentials Support
-- Execute this SQL in your Supabase SQL Editor to add the new user_credentials table
-- =============================================================================

-- Step 1: Create the user_credentials table if it doesn't exist
CREATE TABLE IF NOT EXISTS user_credentials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL, -- references auth.users(id)
  company_id UUID REFERENCES companies(id),
  username_encrypted TEXT NOT NULL,
  password_encrypted TEXT NOT NULL,
  site_url VARCHAR(255) DEFAULT 'https://dashboard.cantaloupe.online',
  is_active BOOLEAN DEFAULT true,
  last_validated TIMESTAMP,
  validation_status VARCHAR(20) DEFAULT 'pending' CHECK (validation_status IN ('pending', 'valid', 'invalid')),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(user_id)
);

-- Step 2: Create indexes for performance (only if they don't exist)
CREATE INDEX IF NOT EXISTS idx_user_credentials_user ON user_credentials(user_id);
CREATE INDEX IF NOT EXISTS idx_user_credentials_company ON user_credentials(company_id);

-- Step 3: Enable Row Level Security
ALTER TABLE user_credentials ENABLE ROW LEVEL SECURITY;

-- Step 4: Create RLS policy for user credentials
DROP POLICY IF EXISTS "credentials_user_access" ON user_credentials;
CREATE POLICY "credentials_user_access" ON user_credentials
  FOR ALL USING (
    auth.jwt() ->> 'role' = 'admin' OR
    user_id = auth.uid()
  );

-- Step 5: Grant necessary permissions
GRANT ALL ON user_credentials TO authenticated;
GRANT ALL ON user_credentials TO service_role;

-- =============================================================================
-- VERIFICATION QUERIES
-- =============================================================================

-- Check if the table was created successfully
SELECT table_name, column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_name = 'user_credentials'
ORDER BY ordinal_position;

-- Check if indexes were created
SELECT indexname, indexdef
FROM pg_indexes
WHERE tablename = 'user_credentials';

-- Check if RLS is enabled
SELECT schemaname, tablename, rowsecurity
FROM pg_tables
WHERE tablename = 'user_credentials';

-- Check if policies exist
SELECT policyname, tablename, cmd, qual
FROM pg_policies
WHERE tablename = 'user_credentials';

-- =============================================================================
-- ROLLBACK SCRIPT (if needed)
-- =============================================================================

-- Uncomment the following lines if you need to rollback these changes:

-- DROP POLICY IF EXISTS "credentials_user_access" ON user_credentials;
-- DROP INDEX IF EXISTS idx_user_credentials_user;
-- DROP INDEX IF EXISTS idx_user_credentials_company;
-- DROP TABLE IF EXISTS user_credentials;

-- =============================================================================
-- NOTES
-- =============================================================================

-- 1. This script is idempotent - it can be run multiple times safely
-- 2. The user_credentials table stores encrypted username/password for DEX API access
-- 3. Each user can have only one set of credentials (enforced by UNIQUE constraint)
-- 4. RLS policies ensure users can only access their own credentials
-- 5. The validation_status field tracks whether credentials have been verified
-- 6. All timestamps are in UTC
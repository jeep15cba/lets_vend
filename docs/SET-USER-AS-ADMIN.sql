-- Set a user as admin by updating their user_metadata
-- Replace 'your-email@example.com' with your actual email address

-- Update the user_metadata to set role as 'admin'
UPDATE auth.users
SET
  raw_user_meta_data = raw_user_meta_data || '{"role": "admin"}'::jsonb
WHERE email = 'adam@adamy.com.au';  -- REPLACE THIS WITH YOUR EMAIL

-- Verify the change
SELECT
  id,
  email,
  raw_user_meta_data->>'role' as role
FROM auth.users
WHERE email = 'adam@adamy.com.au';  -- REPLACE THIS WITH YOUR EMAIL

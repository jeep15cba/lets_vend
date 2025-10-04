-- RLS Policies for machines table
-- These policies allow authenticated users to access machines in their company
-- Uses user_credentials table to link user to company

-- Enable RLS on machines table (if not already enabled)
ALTER TABLE machines ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Users can view their company machines" ON machines;
DROP POLICY IF EXISTS "Users can insert machines for their company" ON machines;
DROP POLICY IF EXISTS "Users can update their company machines" ON machines;
DROP POLICY IF EXISTS "Users can delete their company machines" ON machines;
DROP POLICY IF EXISTS "machine_company_access" ON machines;

-- Policy 1: Users can SELECT machines in their company
CREATE POLICY "Users can view their company machines"
ON machines
FOR SELECT
TO authenticated
USING (
  company_id IN (
    SELECT company_id FROM user_credentials WHERE user_id = auth.uid()
  )
);

-- Policy 2: Users can INSERT machines for their company
CREATE POLICY "Users can insert machines for their company"
ON machines
FOR INSERT
TO authenticated
WITH CHECK (
  company_id IN (
    SELECT company_id FROM user_credentials WHERE user_id = auth.uid()
  )
);

-- Policy 3: Users can UPDATE machines in their company
CREATE POLICY "Users can update their company machines"
ON machines
FOR UPDATE
TO authenticated
USING (
  company_id IN (
    SELECT company_id FROM user_credentials WHERE user_id = auth.uid()
  )
)
WITH CHECK (
  company_id IN (
    SELECT company_id FROM user_credentials WHERE user_id = auth.uid()
  )
);

-- Policy 4: Users can DELETE machines in their company
CREATE POLICY "Users can delete their company machines"
ON machines
FOR DELETE
TO authenticated
USING (
  company_id IN (
    SELECT company_id FROM user_credentials WHERE user_id = auth.uid()
  )
);

-- Note: These policies use the user_credentials table to link users to companies
-- The user_credentials table has user_id and company_id, making it perfect for RLS

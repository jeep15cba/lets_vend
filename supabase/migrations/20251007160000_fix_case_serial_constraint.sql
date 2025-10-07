-- Fix case_serial unique constraint to be composite with company_id
-- This allows multiple companies to have devices with the same case_serial
-- (e.g., when using shared test DEX credentials)

-- Drop the existing unique constraint on case_serial
ALTER TABLE machines DROP CONSTRAINT IF EXISTS machines_case_serial_key;

-- Add a composite unique constraint on (company_id, case_serial)
ALTER TABLE machines ADD CONSTRAINT machines_company_case_serial_key
  UNIQUE (company_id, case_serial);

-- Add index for better query performance
CREATE INDEX IF NOT EXISTS idx_machines_company_case_serial
  ON machines(company_id, case_serial);

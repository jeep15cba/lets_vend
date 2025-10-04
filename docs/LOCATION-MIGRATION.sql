-- Migration to replace location_id with location JSON field
-- Execute this SQL in your Supabase SQL Editor

-- Step 1: Add the new location JSON field
ALTER TABLE machines
ADD COLUMN location JSONB;

-- Step 2: Drop dependent objects and the old location_id column
-- First drop the materialized view that depends on location_id
DROP MATERIALIZED VIEW IF EXISTS machine_summaries CASCADE;

-- Now drop the foreign key constraint and column
ALTER TABLE machines
DROP CONSTRAINT IF EXISTS machines_location_id_fkey;

ALTER TABLE machines
DROP COLUMN IF EXISTS location_id;

-- Step 3: Update existing data to move location from notes to location field
UPDATE machines
SET location = (notes::jsonb -> 'location')
WHERE notes IS NOT NULL
AND notes::jsonb ? 'location';

-- Step 4: Clean up the notes field by removing the location data
UPDATE machines
SET notes = jsonb_set(
  notes::jsonb,
  '{location}',
  'null'::jsonb
)
WHERE notes IS NOT NULL
AND notes::jsonb ? 'location';

-- Step 5: Add an index on the location field for better performance
CREATE INDEX IF NOT EXISTS idx_machines_location_optional
ON machines ((location->>'optional'));

-- Step 6: Recreate a simplified materialized view without location_id dependency
-- Only using tables that exist in the current schema
CREATE MATERIALIZED VIEW machine_summaries AS
SELECT
  m.id as machine_id,
  m.case_serial,
  c.company_name as customer_name,
  (m.location->>'optional') as location_name,
  m.machine_type,
  m.status,
  m.firmware_version,
  m.created_at,
  m.updated_at

FROM machines m
LEFT JOIN companies c ON c.id = m.company_id;

-- Create unique index for concurrent refresh
CREATE UNIQUE INDEX IF NOT EXISTS idx_machine_summaries_machine_id
ON machine_summaries (machine_id);

-- Verify the changes
SELECT
  case_serial,
  location,
  notes
FROM machines
LIMIT 5;
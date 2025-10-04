-- Add latest_dex_parsed column to machines table
-- This will store the parsed DEX data directly on the machine record
-- to avoid expensive joins to dex_captures table

ALTER TABLE machines
ADD COLUMN IF NOT EXISTS latest_dex_parsed JSONB;

-- Add comment to document the column
COMMENT ON COLUMN machines.latest_dex_parsed IS 'Stores the most recent parsed DEX data including hybridData with keyValueGroups for quick access without joins';

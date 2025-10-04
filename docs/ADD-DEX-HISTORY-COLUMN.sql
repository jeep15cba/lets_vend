-- Add DEX history tracking column to machines table
-- Run this SQL in your Supabase SQL Editor

-- Add dex_history column to store JSON array of DEX records
ALTER TABLE machines
ADD COLUMN dex_history JSONB DEFAULT '[]'::jsonb;

-- Add index for better performance when querying DEX history
CREATE INDEX idx_machines_dex_history_gin ON machines USING gin (dex_history);

-- Add comment explaining the column structure
COMMENT ON COLUMN machines.dex_history IS 'JSON array storing DEX record history: [{"dexId": "12345", "created": "2025-09-27 02:07:07"}, ...]';

-- Example of how to query the data:
-- SELECT case_serial, dex_history FROM machines WHERE dex_history @> '[{"dexId": "12345"}]';
-- SELECT case_serial, jsonb_array_length(dex_history) as dex_count FROM machines;
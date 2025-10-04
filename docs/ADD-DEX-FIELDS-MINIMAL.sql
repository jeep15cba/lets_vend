-- Add DEX tracking fields to machines table (MINIMAL VERSION)
-- Execute this SQL in your Supabase SQL Editor

-- Add DEX tracking columns to machines table
ALTER TABLE machines
ADD COLUMN IF NOT EXISTS latest_dex_data TIMESTAMP,
ADD COLUMN IF NOT EXISTS dex_last_4hrs INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS dex_total_records INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS dex_last_capture TIMESTAMP,
ADD COLUMN IF NOT EXISTS dex_has_errors BOOLEAN DEFAULT false;

-- Create a minimal view that only uses columns we know exist
CREATE OR REPLACE VIEW machine_dex_summary AS
SELECT
  m.id as machine_id,
  m.case_serial,
  m.machine_model,
  m.status,
  m.location,
  m.latest_dex_data,
  m.dex_last_4hrs,
  m.dex_total_records,
  m.dex_last_capture,
  m.dex_has_errors,
  COALESCE(dex_stats.total_records, 0) as total_dex_records_actual,
  dex_stats.last_created as last_dex_capture_actual,
  COALESCE(dex_stats.last_24hrs, 0) as dex_last_24hrs,
  COALESCE(dex_stats.last_4hrs_actual, 0) as dex_last_4hrs_actual,
  COALESCE(dex_stats.error_count, 0) as error_count
FROM machines m
LEFT JOIN (
  SELECT
    machine_id,
    COUNT(*) as total_records,
    MAX(created_at) as last_created,
    COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '24 hours') as last_24hrs,
    COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '4 hours') as last_4hrs_actual,
    COUNT(*) FILTER (WHERE has_errors = true) as error_count
  FROM dex_captures
  GROUP BY machine_id
) dex_stats ON dex_stats.machine_id = m.id;

-- Grant access to the view
GRANT SELECT ON machine_dex_summary TO authenticated;
GRANT SELECT ON machine_dex_summary TO service_role;

-- Test query
SELECT 'DEX fields added to machines table successfully' as status;
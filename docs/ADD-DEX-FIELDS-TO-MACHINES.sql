-- Add DEX tracking fields to machines table
-- Execute this SQL in your Supabase SQL Editor

-- Add DEX tracking columns to machines table
ALTER TABLE machines
ADD COLUMN IF NOT EXISTS latest_dex_data TIMESTAMP,
ADD COLUMN IF NOT EXISTS dex_last_4hrs INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS dex_total_records INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS dex_last_capture TIMESTAMP,
ADD COLUMN IF NOT EXISTS dex_has_errors BOOLEAN DEFAULT false;

-- Create a view for easy DEX data access with machines
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
  COUNT(dc.id) as total_dex_records_actual,
  MAX(dc.capture_time) as last_dex_capture_actual,
  COUNT(dc.id) FILTER (WHERE dc.capture_time >= NOW() - INTERVAL '24 hours') as dex_last_24hrs,
  COUNT(dc.id) FILTER (WHERE dc.capture_time >= NOW() - INTERVAL '4 hours') as dex_last_4hrs_actual,
  COUNT(dc.id) FILTER (WHERE dc.has_errors = true) as error_count
FROM machines m
LEFT JOIN dex_captures dc ON dc.machine_id = m.id
GROUP BY m.id, m.case_serial, m.machine_model, m.status, m.location,
         m.latest_dex_data, m.dex_last_4hrs, m.dex_total_records,
         m.dex_last_capture, m.dex_has_errors;

-- Grant access to the view
GRANT SELECT ON machine_dex_summary TO authenticated;
GRANT SELECT ON machine_dex_summary TO service_role;

-- Test query
SELECT 'DEX fields added to machines table successfully' as status;
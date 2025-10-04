-- DEX Captures table for storing DEX data from Cantaloupe
-- Execute this SQL in your Supabase SQL Editor

CREATE TABLE IF NOT EXISTS dex_captures (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dex_id VARCHAR(50) UNIQUE NOT NULL, -- Cantaloupe DEX record ID
  machine_id UUID REFERENCES machines(id),
  case_serial VARCHAR(50) NOT NULL,
  company_id UUID, -- Will add foreign key after checking if companies table exists
  raw_data TEXT, -- Raw DEX string data
  parsed_data JSONB, -- Parsed DEX data structure
  capture_time TIMESTAMP, -- When the DEX was originally captured by Cantaloupe
  has_errors BOOLEAN DEFAULT false,
  record_count INTEGER DEFAULT 0, -- Number of records in this DEX capture
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_dex_captures_machine_id ON dex_captures(machine_id);
CREATE INDEX IF NOT EXISTS idx_dex_captures_case_serial ON dex_captures(case_serial);
CREATE INDEX IF NOT EXISTS idx_dex_captures_company_id ON dex_captures(company_id);
CREATE INDEX IF NOT EXISTS idx_dex_captures_capture_time ON dex_captures(capture_time DESC);
CREATE INDEX IF NOT EXISTS idx_dex_captures_created_at ON dex_captures(created_at DESC);

-- Add RLS policies for security
ALTER TABLE dex_captures ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only see DEX captures for machines they have access to
-- Note: This will need to be updated based on your actual auth structure
CREATE POLICY "Users can view their DEX captures" ON dex_captures
  FOR SELECT USING (
    machine_id IN (
      SELECT id FROM machines
      WHERE company_id = (
        -- This will need to be updated based on your user-company relationship
        SELECT company_id FROM user_profiles
        WHERE id = auth.uid()
        LIMIT 1
      )
    )
  );

-- Policy: Service role can insert/update DEX captures
CREATE POLICY "Service can manage DEX captures" ON dex_captures
  FOR ALL USING (auth.role() = 'service_role');

-- Add fields to machines table for DEX tracking
ALTER TABLE machines
ADD COLUMN IF NOT EXISTS latest_dex_data TIMESTAMP,
ADD COLUMN IF NOT EXISTS dex_last_4hrs INTEGER DEFAULT 0;

-- Create a view for easy DEX data access
CREATE OR REPLACE VIEW machine_dex_summary AS
SELECT
  m.id as machine_id,
  m.case_serial,
  m.latest_dex_data,
  m.dex_last_4hrs,
  COUNT(dc.id) as total_dex_records,
  MAX(dc.capture_time) as last_dex_capture,
  COUNT(dc.id) FILTER (WHERE dc.capture_time >= NOW() - INTERVAL '24 hours') as dex_last_24hrs,
  COUNT(dc.id) FILTER (WHERE dc.has_errors = true) as error_count
FROM machines m
LEFT JOIN dex_captures dc ON dc.machine_id = m.id
GROUP BY m.id, m.case_serial, m.latest_dex_data, m.dex_last_4hrs;

-- Grant access to the view
GRANT SELECT ON machine_dex_summary TO authenticated;
GRANT SELECT ON machine_dex_summary TO service_role;
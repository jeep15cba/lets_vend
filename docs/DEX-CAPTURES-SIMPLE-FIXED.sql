-- Ultra-simple DEX Captures table that works with any database structure
-- Execute this SQL in your Supabase SQL Editor

-- Create DEX captures table without any complex dependencies
CREATE TABLE IF NOT EXISTS dex_captures (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dex_id VARCHAR(50) UNIQUE NOT NULL, -- Cantaloupe DEX record ID
  machine_id UUID REFERENCES machines(id),
  case_serial VARCHAR(50) NOT NULL,
  raw_data TEXT, -- Raw DEX string data
  parsed_data JSONB, -- Parsed DEX data structure
  capture_time TIMESTAMP, -- When the DEX was originally captured by Cantaloupe
  has_errors BOOLEAN DEFAULT false,
  record_count INTEGER DEFAULT 0, -- Number of records in this DEX capture
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Add basic indexes for performance
CREATE INDEX IF NOT EXISTS idx_dex_captures_machine_id ON dex_captures(machine_id);
CREATE INDEX IF NOT EXISTS idx_dex_captures_case_serial ON dex_captures(case_serial);
CREATE INDEX IF NOT EXISTS idx_dex_captures_created_at ON dex_captures(created_at DESC);

-- Enable RLS
ALTER TABLE dex_captures ENABLE ROW LEVEL SECURITY;

-- Simple policy: Service role can manage everything
CREATE POLICY "Service can manage DEX captures" ON dex_captures
  FOR ALL USING (auth.role() = 'service_role');

-- Simple policy: All authenticated users can read DEX captures for now
-- TODO: Restrict this based on your actual user-company relationship structure
CREATE POLICY "Authenticated users can read DEX captures" ON dex_captures
  FOR SELECT USING (auth.role() = 'authenticated');

-- Test that the table was created successfully
SELECT 'DEX Captures table created successfully' as status, COUNT(*) as initial_count FROM dex_captures;
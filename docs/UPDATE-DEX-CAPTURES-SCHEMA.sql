-- Update DEX captures table for improved hybrid parsing and RLS
-- Execute this SQL in your Supabase SQL Editor

-- Add company_id field for direct RLS filtering and better performance
ALTER TABLE dex_captures
ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies(id);

-- Update the dex_id column to be TEXT instead of BIGINT to handle various ID formats
ALTER TABLE dex_captures
ALTER COLUMN dex_id TYPE TEXT;

-- Drop the unique constraint on dex_id temporarily
ALTER TABLE dex_captures
DROP CONSTRAINT IF EXISTS dex_captures_dex_id_key;

-- Add composite unique constraint with company_id to allow same dex_id across different companies
ALTER TABLE dex_captures
ADD CONSTRAINT dex_captures_dex_id_company_unique UNIQUE (dex_id, company_id);

-- Rename structured_data to parsed_data to match our API structure (only if parsed_data doesn't exist)
DO $$
BEGIN
  -- Only rename if structured_data exists AND parsed_data doesn't exist
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name = 'dex_captures' AND column_name = 'structured_data')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns
                     WHERE table_name = 'dex_captures' AND column_name = 'parsed_data') THEN
    ALTER TABLE dex_captures RENAME COLUMN structured_data TO parsed_data;
  END IF;
END $$;

-- Add new columns for hybrid parsing features
ALTER TABLE dex_captures
ADD COLUMN IF NOT EXISTS record_count INTEGER DEFAULT 0;

-- Update existing RLS policy to use direct company_id check (more efficient)
DROP POLICY IF EXISTS "dex_company_access" ON dex_captures;
CREATE POLICY "dex_company_access" ON dex_captures
  FOR ALL USING (
    auth.jwt() ->> 'role' = 'admin' OR
    company_id = (auth.jwt() ->> 'company_id')::UUID
  );

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_dex_captures_company ON dex_captures(company_id);
CREATE INDEX IF NOT EXISTS idx_dex_captures_dex_id_company ON dex_captures(dex_id, company_id);

-- Populate company_id for existing records (if any)
UPDATE dex_captures
SET company_id = machines.company_id
FROM machines
WHERE dex_captures.machine_id = machines.id
  AND dex_captures.company_id IS NULL;

-- Make company_id required for new records
ALTER TABLE dex_captures
ALTER COLUMN company_id SET NOT NULL;

-- Update the materialized view to use the new parsed_data structure
DROP MATERIALIZED VIEW IF EXISTS machine_summaries;
CREATE MATERIALIZED VIEW machine_summaries AS
SELECT
  m.id as machine_id,
  m.case_serial,
  c.company_name as customer_name,
  l.location_name,
  m.machine_type,
  m.status,
  m.firmware_version,

  -- Latest DEX capture info with hybrid data
  latest_dex.dex_id,
  latest_dex.created_at as last_dex_update,
  latest_dex.has_errors,
  latest_dex.latest_event,
  latest_dex.latest_ma5_error,
  latest_dex.total_sales as dex_total_sales,
  latest_dex.total_vends,
  latest_dex.cash_in_box,

  -- Latest temperature data
  temp.current_temperature,
  temp.target_temperature,
  temp.temperature_unit,

  -- Latest cash data
  cash_summary.total_cash,
  cash_summary.denominations,

  -- Product and sales summary
  COALESCE(product_summary.total_products, 0) as total_products,
  COALESCE(product_summary.active_products, 0) as active_products,
  COALESCE(sales_summary.total_sales, 0) as recent_total_sales,
  COALESCE(sales_summary.total_revenue, 0) as total_revenue,

  -- Error summary
  COALESCE(error_summary.error_count, 0) as error_count,
  COALESCE(error_summary.critical_errors, 0) as critical_errors,

  -- Data freshness
  (latest_dex.created_at > NOW() - INTERVAL '4 hours') as has_recent_data

FROM machines m
LEFT JOIN companies c ON m.company_id = c.id
LEFT JOIN locations l ON (m.location->>'id')::UUID = l.id

-- Latest DEX capture with hybrid data
LEFT JOIN LATERAL (
  SELECT
    dex_id,
    created_at,
    has_errors,
    parsed_data->'hybridData'->'summary'->>'latestEvent' as latest_event,
    parsed_data->'hybridData'->'summary'->>'latestMa5Error' as latest_ma5_error,
    parsed_data->'hybridData'->'summary'->>'totalSales' as total_sales,
    parsed_data->'hybridData'->'summary'->>'totalVends' as total_vends,
    parsed_data->'hybridData'->'summary'->>'cashInBox' as cash_in_box
  FROM dex_captures dc
  WHERE dc.machine_id = m.id
  ORDER BY created_at DESC
  LIMIT 1
) latest_dex ON true

-- Latest temperature reading
LEFT JOIN LATERAL (
  SELECT current_temperature, target_temperature, temperature_unit
  FROM temperature_readings tr
  WHERE tr.machine_id = m.id
  ORDER BY reading_timestamp DESC
  LIMIT 1
) temp ON true

-- Cash summary
LEFT JOIN LATERAL (
  SELECT
    SUM(total_value) as total_cash,
    jsonb_object_agg(denomination, coin_count) as denominations
  FROM cash_audits ca
  WHERE ca.machine_id = m.id
    AND ca.audit_date = (
      SELECT MAX(audit_date)
      FROM cash_audits ca2
      WHERE ca2.machine_id = m.id
    )
) cash_summary ON true

-- Product summary
LEFT JOIN LATERAL (
  SELECT
    COUNT(*) as total_products,
    COUNT(*) FILTER (WHERE is_active = true) as active_products
  FROM machine_slots ms
  WHERE ms.machine_id = m.id
) product_summary ON true

-- Sales summary (last 30 days)
LEFT JOIN LATERAL (
  SELECT
    COUNT(*) as total_sales,
    SUM(total_amount) as total_revenue
  FROM sales_transactions st
  WHERE st.machine_id = m.id
    AND st.transaction_date > NOW() - INTERVAL '30 days'
) sales_summary ON true

-- Error summary (unresolved errors)
LEFT JOIN LATERAL (
  SELECT
    COUNT(*) as error_count,
    COUNT(*) FILTER (WHERE severity = 'critical') as critical_errors
  FROM machine_errors me
  WHERE me.machine_id = m.id
    AND me.is_resolved = false
) error_summary ON true

WHERE m.status = 'active';

-- Create index on materialized view
CREATE UNIQUE INDEX IF NOT EXISTS machine_summaries_machine_id_idx ON machine_summaries (machine_id);

-- Grant appropriate permissions
GRANT SELECT ON machine_summaries TO authenticated;

-- Add comment explaining the schema updates
COMMENT ON TABLE dex_captures IS 'DEX data captures with hybrid parsing support, company-based RLS, and event/error code mapping';
COMMENT ON COLUMN dex_captures.company_id IS 'Direct company reference for efficient RLS filtering';
COMMENT ON COLUMN dex_captures.parsed_data IS 'JSONB containing structured, key-value, and hybrid parsed data including event codes and MA5 errors';
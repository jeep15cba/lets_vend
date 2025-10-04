-- Supabase Database Schema for Vending Machine Management System
-- Execute this SQL in your Supabase SQL Editor

-- =============================================================================
-- CORE TABLES
-- =============================================================================

-- Companies/Customers table
CREATE TABLE companies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_name VARCHAR(255) NOT NULL,
  company_code VARCHAR(50) UNIQUE,
  contact_email VARCHAR(255),
  contact_phone VARCHAR(50),
  address TEXT,
  city VARCHAR(100),
  state VARCHAR(50),
  zip_code VARCHAR(20),
  country VARCHAR(50) DEFAULT 'Australia',
  billing_address TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Locations/Sites table
CREATE TABLE locations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES companies(id),
  location_name VARCHAR(255) NOT NULL,
  location_code VARCHAR(50),
  address TEXT,
  city VARCHAR(100),
  state VARCHAR(50),
  zip_code VARCHAR(20),
  latitude DECIMAL(10, 8),
  longitude DECIMAL(11, 8),
  contact_name VARCHAR(255),
  contact_phone VARCHAR(50),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Core machine/device registry
CREATE TABLE machines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_serial VARCHAR(50) UNIQUE NOT NULL,
  company_id UUID REFERENCES companies(id),
  location_id UUID REFERENCES locations(id),
  machine_model VARCHAR(100),
  machine_type VARCHAR(20) CHECK (machine_type IN ('food', 'beverage', 'snack', 'combo')),
  manufacturer VARCHAR(100),
  install_date DATE,
  warranty_expiry DATE,
  cash_enabled BOOLEAN DEFAULT false,
  card_enabled BOOLEAN DEFAULT false,
  mobile_payment_enabled BOOLEAN DEFAULT false,
  network_type VARCHAR(50),
  sim_card_number VARCHAR(50),
  firmware_version VARCHAR(50),
  last_maintenance DATE,
  maintenance_schedule VARCHAR(50),
  status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'maintenance', 'retired')),
  notes TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- DEX data captures (raw data from Cantaloupe)
CREATE TABLE dex_captures (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  machine_id UUID REFERENCES machines(id),
  case_serial VARCHAR(50) NOT NULL,
  dex_id BIGINT NOT NULL UNIQUE,
  raw_content TEXT,
  structured_data JSONB,
  firmware VARCHAR(50),
  capture_source VARCHAR(50) DEFAULT 'cantaloupe-api',
  file_size INTEGER,
  line_count INTEGER,
  field_types TEXT[],
  has_errors BOOLEAN DEFAULT false,
  processing_status VARCHAR(20) DEFAULT 'pending' CHECK (processing_status IN ('pending', 'processed', 'failed')),
  processed_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Product definitions and catalog
CREATE TABLE products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_code VARCHAR(50) UNIQUE NOT NULL,
  product_name VARCHAR(255) NOT NULL,
  brand VARCHAR(100),
  category VARCHAR(100),
  subcategory VARCHAR(100),
  description TEXT,
  ingredients TEXT,
  allergens TEXT,
  nutritional_info JSONB,
  barcode VARCHAR(50),
  weight_grams INTEGER,
  volume_ml INTEGER,
  cost_price DECIMAL(10, 2),
  suggested_retail_price DECIMAL(10, 2),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Machine product slots (planogram)
CREATE TABLE machine_slots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  machine_id UUID REFERENCES machines(id),
  slot_number VARCHAR(10) NOT NULL,
  product_id UUID REFERENCES products(id),
  current_price DECIMAL(10, 2),
  capacity INTEGER,
  current_stock INTEGER,
  par_level INTEGER,
  is_active BOOLEAN DEFAULT true,
  last_refill_date TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(machine_id, slot_number)
);

-- Sales transactions (extracted from DEX PA1/PA2 data)
CREATE TABLE sales_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  machine_id UUID REFERENCES machines(id),
  slot_number VARCHAR(10),
  product_id UUID REFERENCES products(id),
  dex_capture_id UUID REFERENCES dex_captures(id),
  quantity_sold INTEGER DEFAULT 1,
  unit_price DECIMAL(10, 2),
  total_amount DECIMAL(10, 2),
  payment_method VARCHAR(20),
  transaction_date TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Cash audit data (extracted from DEX CA17 data)
CREATE TABLE cash_audits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  machine_id UUID REFERENCES machines(id),
  dex_capture_id UUID REFERENCES dex_captures(id),
  denomination VARCHAR(10),
  coin_count INTEGER,
  coin_value DECIMAL(10, 2),
  total_value DECIMAL(10, 2),
  audit_date TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Machine errors and alerts (extracted from DEX MA5/EA data)
CREATE TABLE machine_errors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  machine_id UUID REFERENCES machines(id),
  dex_capture_id UUID REFERENCES dex_captures(id),
  error_category VARCHAR(50),
  error_code VARCHAR(20),
  error_type VARCHAR(100),
  error_description TEXT,
  severity VARCHAR(20) DEFAULT 'medium' CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  is_resolved BOOLEAN DEFAULT false,
  resolved_at TIMESTAMP,
  resolved_by VARCHAR(255),
  resolution_notes TEXT,
  first_occurred TIMESTAMP,
  last_occurred TIMESTAMP,
  occurrence_count INTEGER DEFAULT 1,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Temperature readings (extracted from DEX MA5 data)
CREATE TABLE temperature_readings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  machine_id UUID REFERENCES machines(id),
  dex_capture_id UUID REFERENCES dex_captures(id),
  reading_type VARCHAR(50),
  current_temperature DECIMAL(5, 2),
  target_temperature DECIMAL(5, 2),
  temperature_unit VARCHAR(2) DEFAULT 'C',
  is_within_range BOOLEAN,
  reading_timestamp TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

-- User credentials for accessing Cantaloupe API (encrypted)
CREATE TABLE user_credentials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL, -- references auth.users(id)
  company_id UUID REFERENCES companies(id),
  username_encrypted TEXT NOT NULL,
  password_encrypted TEXT NOT NULL,
  site_url VARCHAR(255) DEFAULT 'https://dashboard.cantaloupe.online',
  is_active BOOLEAN DEFAULT true,
  last_validated TIMESTAMP,
  validation_status VARCHAR(20) DEFAULT 'pending' CHECK (validation_status IN ('pending', 'valid', 'invalid')),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(user_id)
);

-- =============================================================================
-- INDEXES FOR PERFORMANCE
-- =============================================================================

CREATE INDEX idx_machines_case_serial ON machines(case_serial);
CREATE INDEX idx_machines_company ON machines(company_id);
CREATE INDEX idx_machines_location ON machines(location_id);
CREATE INDEX idx_dex_captures_machine ON dex_captures(machine_id);
CREATE INDEX idx_dex_captures_created ON dex_captures(created_at DESC);
CREATE INDEX idx_dex_captures_dex_id ON dex_captures(dex_id);
CREATE INDEX idx_sales_machine_date ON sales_transactions(machine_id, transaction_date DESC);
CREATE INDEX idx_errors_machine_resolved ON machine_errors(machine_id, is_resolved);
CREATE INDEX idx_temperature_machine_timestamp ON temperature_readings(machine_id, reading_timestamp DESC);
CREATE INDEX idx_user_credentials_user ON user_credentials(user_id);
CREATE INDEX idx_user_credentials_company ON user_credentials(company_id);

-- =============================================================================
-- ROW LEVEL SECURITY POLICIES
-- =============================================================================

-- Enable RLS on all tables
ALTER TABLE companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE machines ENABLE ROW LEVEL SECURITY;
ALTER TABLE dex_captures ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE machine_slots ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE cash_audits ENABLE ROW LEVEL SECURITY;
ALTER TABLE machine_errors ENABLE ROW LEVEL SECURITY;
ALTER TABLE temperature_readings ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_credentials ENABLE ROW LEVEL SECURITY;

-- Companies policy: Users can only see their own company
CREATE POLICY "company_access" ON companies
  FOR ALL USING (
    auth.jwt() ->> 'role' = 'admin' OR
    id = (auth.jwt() ->> 'company_id')::UUID
  );

-- Locations policy: Users can only see locations from their company
CREATE POLICY "location_company_access" ON locations
  FOR ALL USING (
    auth.jwt() ->> 'role' = 'admin' OR
    company_id = (auth.jwt() ->> 'company_id')::UUID
  );

-- Machines policy: Users can only see machines from their company
CREATE POLICY "machine_company_access" ON machines
  FOR ALL USING (
    auth.jwt() ->> 'role' = 'admin' OR
    company_id = (auth.jwt() ->> 'company_id')::UUID
  );

-- DEX captures policy: Users can only see data from their company's machines
CREATE POLICY "dex_company_access" ON dex_captures
  FOR ALL USING (
    auth.jwt() ->> 'role' = 'admin' OR
    machine_id IN (
      SELECT id FROM machines
      WHERE company_id = (auth.jwt() ->> 'company_id')::UUID
    )
  );

-- Products policy: All users can see products (global catalog)
CREATE POLICY "products_access" ON products
  FOR ALL USING (true);

-- Machine slots policy
CREATE POLICY "slots_company_access" ON machine_slots
  FOR ALL USING (
    auth.jwt() ->> 'role' = 'admin' OR
    machine_id IN (
      SELECT id FROM machines
      WHERE company_id = (auth.jwt() ->> 'company_id')::UUID
    )
  );

-- Sales transactions policy
CREATE POLICY "sales_company_access" ON sales_transactions
  FOR ALL USING (
    auth.jwt() ->> 'role' = 'admin' OR
    machine_id IN (
      SELECT id FROM machines
      WHERE company_id = (auth.jwt() ->> 'company_id')::UUID
    )
  );

-- Cash audits policy
CREATE POLICY "cash_company_access" ON cash_audits
  FOR ALL USING (
    auth.jwt() ->> 'role' = 'admin' OR
    machine_id IN (
      SELECT id FROM machines
      WHERE company_id = (auth.jwt() ->> 'company_id')::UUID
    )
  );

-- Machine errors policy
CREATE POLICY "errors_company_access" ON machine_errors
  FOR ALL USING (
    auth.jwt() ->> 'role' = 'admin' OR
    machine_id IN (
      SELECT id FROM machines
      WHERE company_id = (auth.jwt() ->> 'company_id')::UUID
    )
  );

-- Temperature readings policy
CREATE POLICY "temperature_company_access" ON temperature_readings
  FOR ALL USING (
    auth.jwt() ->> 'role' = 'admin' OR
    machine_id IN (
      SELECT id FROM machines
      WHERE company_id = (auth.jwt() ->> 'company_id')::UUID
    )
  );

-- User credentials policy: Users can only access their own credentials
CREATE POLICY "credentials_user_access" ON user_credentials
  FOR ALL USING (
    auth.jwt() ->> 'role' = 'admin' OR
    user_id = auth.uid()
  );

-- =============================================================================
-- OPTIMIZED SUMMARY VIEW FOR API PERFORMANCE
-- =============================================================================

CREATE MATERIALIZED VIEW machine_summaries AS
SELECT
  m.id as machine_id,
  m.case_serial,
  c.company_name as customer_name,
  l.location_name,
  m.machine_type,
  m.status,
  m.firmware_version,

  -- Latest DEX capture info
  latest_dex.dex_id,
  latest_dex.created_at as last_dex_update,
  latest_dex.has_errors,

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
  COALESCE(sales_summary.total_sales, 0) as total_sales,
  COALESCE(sales_summary.total_revenue, 0) as total_revenue,

  -- Error summary
  COALESCE(error_summary.error_count, 0) as error_count,
  COALESCE(error_summary.critical_errors, 0) as critical_errors,

  -- Data freshness
  (latest_dex.created_at > NOW() - INTERVAL '4 hours') as has_recent_data

FROM machines m
LEFT JOIN companies c ON m.company_id = c.id
LEFT JOIN locations l ON m.location_id = l.id

-- Latest DEX capture
LEFT JOIN LATERAL (
  SELECT dex_id, created_at, has_errors
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

-- =============================================================================
-- FUNCTIONS AND TRIGGERS
-- =============================================================================

-- Function to refresh materialized view
CREATE OR REPLACE FUNCTION refresh_machine_summaries()
RETURNS void AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY machine_summaries;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-refresh summary when new DEX data arrives
CREATE OR REPLACE FUNCTION trigger_refresh_summaries()
RETURNS trigger AS $$
BEGIN
  -- Refresh in background to avoid blocking
  PERFORM pg_notify('refresh_summaries', NEW.machine_id::text);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER refresh_on_new_dex
  AFTER INSERT ON dex_captures
  FOR EACH ROW
  EXECUTE FUNCTION trigger_refresh_summaries();

-- =============================================================================
-- SAMPLE DATA (OPTIONAL - FOR TESTING)
-- =============================================================================

-- Insert sample company
INSERT INTO companies (id, company_name, company_code, contact_email, country)
VALUES (
  '550e8400-e29b-41d4-a716-446655440000'::UUID,
  'Test Vending Company',
  'TVC001',
  'admin@testvendingco.com',
  'Australia'
);

-- Insert sample location
INSERT INTO locations (company_id, location_name, location_code, city, state)
VALUES (
  '550e8400-e29b-41d4-a716-446655440000'::UUID,
  'Head Office',
  'HO001',
  'Sydney',
  'NSW'
);

-- Note: After creating these tables, you'll need to:
-- 1. Set up authentication users with company_id in their metadata
-- 2. Import your existing machine data
-- 3. Process DEX data into the structured tables
-- 4. Test RLS policies with different user roles
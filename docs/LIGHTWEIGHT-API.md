# Lightweight API Architecture

This document describes the new lightweight API architecture that replaces the heavy 646KB static file approach.

## Overview

The new architecture provides:
- **Lightweight summaries** for list views (~5KB vs 646KB)
- **On-demand details** for individual machines
- **Simplified data structures** for easier frontend consumption
- **Caching** at the API level (5 minutes)
- **Future Supabase integration** pathway

## API Endpoints

### 1. Raw DEX Content Fetcher `/api/fetch-raw-dex-content`

**Purpose**: Fetch and process raw DEX data from Cantaloupe API
**Method**: POST
**Authentication**: CSRF token extraction from dashboard
**Processing**: Gzip decompression and DEX field structuring

**Request Format**:
```json
{
  "dexIds": [23204016, 23204017]
}
```

**Response Format**:
```json
{
  "success": true,
  "data": {
    "23204016": {
      "raw": "ST*001*0001*001...",
      "structured": {
        "CA17": [{"raw": "CA17*00*10*59", "data": ["00", "10", "59"]}],
        "PA1": [{"raw": "PA1*10*360", "data": ["10", "360"]}],
        "PA2": [{"raw": "PA2*53*19080", "data": ["53", "19080"]}],
        "MA5": [{"raw": "MA5*DETECTED TEMPERATURE*600*C", "data": ["DETECTED TEMPERATURE", "600", "C"]}]
      },
      "summary": {
        "totalLines": 156,
        "fieldTypes": ["CA17", "PA1", "PA2", "MA5"],
        "hasCoins": 5,
        "hasProducts": 45,
        "hasTemperature": 2
      }
    }
  }
}
```

### 2. Machine Summaries `/api/machines/summary`

**Purpose**: Lightweight data for devices list view
**Size**: ~5KB (vs 646KB previously)
**Cache**: 5 minutes

**Response Format**:
```json
{
  "success": true,
  "data": {
    "552234133196": {
      "caseSerial": "552234133196",
      "customerName": "Isavend",
      "lastDexUpdate": "2025-09-27 02:07:07",
      "firmware": "1.8.18.1",
      "temperature": {
        "current": "6.0",
        "target": "4.0",
        "unit": "C"
      },
      "cash": {
        "total": 15.40,
        "denominations": {
          "0.10": 59,
          "0.20": 40,
          "0.50": 28,
          "1.00": 27,
          "2.00": 37
        }
      },
      "errors": [
        {
          "type": "machine",
          "code": "E001",
          "description": "Temperature sensor error"
        }
      ],
      "productCount": 70,
      "hasRecentData": true
    }
  },
  "totalMachines": 49,
  "lastUpdated": "2025-09-27T02:07:07.000Z"
}
```

### 2. Machine Details `/api/machines/[caseSerial]/details`

**Purpose**: Full machine data for expanded/detail views
**Cache**: 5 minutes

**Response Format**:
```json
{
  "success": true,
  "data": {
    "caseSerial": "552234133196",
    "customerName": "Isavend",
    "lastDexUpdate": "2025-09-27 02:07:07",
    "firmware": "1.8.18.1",
    "dexId": 23204016,
    "products": [
      {
        "slot": "10",
        "price": 3.60,
        "sales": 53,
        "revenue": 190.80,
        "isActive": true
      }
    ],
    "cashDetails": {
      "totalCash": 15.40,
      "denominations": [
        {
          "type": "0.10",
          "count": 59,
          "value": 0.10,
          "total": 5.90
        }
      ]
    },
    "temperatureDetails": [
      {
        "type": "DETECTED TEMPERATURE",
        "value": "600",
        "unit": "C"
      }
    ],
    "errorDetails": [
      {
        "category": "machine",
        "type": "ERROR",
        "code": "E001",
        "rawRecord": "MA5*ERROR*E001"
      }
    ],
    "totalProducts": 70,
    "activeProducts": 45,
    "totalSales": 2500,
    "totalRevenue": 890.50,
    "hasErrors": false
  }
}
```

### 3. Supabase Demo `/api/machines/supabase-demo`

**Purpose**: Demonstrates future Supabase integration
**Response**: Same format as summary endpoint

## Data Flow Comparison

### Old Approach (Heavy)
```
1. Load 646KB static file on every page visit
2. Parse entire file in browser
3. Extract needed data client-side
4. Heavy memory usage
5. No caching benefits
```

### New Approach (Lightweight)
```
1. Load 5KB summary API for list view
2. Load individual details on-demand
3. Server-side processing and caching
4. Minimal client-side work
5. 5-minute API cache
```

## Frontend Usage

### Before (Heavy Static File)
```javascript
// Load entire 646KB file
const response = await axios.get('/data/comprehensive-raw-dex-data.json');
const data = response.data;

// Complex nested access
const temp = data.machines[caseSerial]?.rawDexContent?.structured?.MA5?.[0]?.data?.[1];
```

### After (Lightweight API)
```javascript
// Load 5KB summary
const summary = await axios.get('/api/machines/summary');

// Simple direct access
const temp = summary.data[caseSerial]?.temperature?.current;

// Load details on-demand
const details = await axios.get(`/api/machines/${caseSerial}/details`);
```

## Benefits

### Performance
- **95% size reduction**: 646KB → 5KB for list view
- **Lazy loading**: Details loaded only when needed
- **Server caching**: 5-minute cache reduces API calls
- **Faster page loads**: Especially on mobile

### Maintainability
- **Simpler data structures**: Direct property access
- **Server-side processing**: Centralized data transformation
- **Type safety**: Consistent response formats
- **Error handling**: Better API error responses

### Scalability
- **Database ready**: Easy migration to Supabase
- **Pagination support**: Can add pagination for large datasets
- **Filtering**: Server-side filtering capabilities
- **Real-time updates**: WebSocket support possible

## Migration Path to Supabase

### Phase 1: Current (File-based with API layer)
```
Static JSON File → Lightweight API → Frontend
```

### Phase 2: Hybrid (Gradual migration)
```
Supabase + File Fallback → Lightweight API → Frontend
```

### Phase 3: Full Supabase (Target state)
```
Supabase → Lightweight API → Frontend
```

## Supabase Schema Design

```sql
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

-- Optimized summary view for API performance
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

-- Indexes for performance
CREATE INDEX idx_machines_case_serial ON machines(case_serial);
CREATE INDEX idx_machines_company ON machines(company_id);
CREATE INDEX idx_machines_location ON machines(location_id);
CREATE INDEX idx_dex_captures_machine ON dex_captures(machine_id);
CREATE INDEX idx_dex_captures_created ON dex_captures(created_at DESC);
CREATE INDEX idx_dex_captures_dex_id ON dex_captures(dex_id);
CREATE INDEX idx_sales_machine_date ON sales_transactions(machine_id, transaction_date DESC);
CREATE INDEX idx_errors_machine_resolved ON machine_errors(machine_id, is_resolved);
CREATE INDEX idx_temperature_machine_timestamp ON temperature_readings(machine_id, reading_timestamp DESC);

-- Row Level Security (RLS) policies
ALTER TABLE companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE machines ENABLE ROW LEVEL SECURITY;
ALTER TABLE dex_captures ENABLE ROW LEVEL SECURITY;

-- Companies can only see their own data
CREATE POLICY "Companies can view own data" ON companies
  FOR ALL USING (
    auth.jwt() ->> 'role' = 'admin' OR
    id = (auth.jwt() ->> 'company_id')::UUID
  );

-- Users can only see machines from their company
CREATE POLICY "Users can view company machines" ON machines
  FOR ALL USING (
    auth.jwt() ->> 'role' = 'admin' OR
    company_id = (auth.jwt() ->> 'company_id')::UUID
  );

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
```

## DEX Field Types and Processing

The system processes various DEX field types from Cantaloupe vending machines:

### Core DEX Fields
- **CA17**: Cash audit data (coin counts and denominations)
- **PA1**: Product slot data (slot number, price)
- **PA2**: Product sales data (sales count, revenue)
- **MA5**: Machine data (temperature, errors, status)
- **EA1-EA9**: Error/Event data for food machines
- **DXS**: Transaction data
- **ST**: Start/header information
- **SE**: End/footer information

### Field Processing Logic
```javascript
// Raw DEX line: "CA17*00*10*59"
// Parsed into:
{
  "raw": "CA17*00*10*59",
  "data": ["00", "10", "59"] // [coin_type, coin_value, coin_count]
}

// Temperature field: "MA5*DETECTED TEMPERATURE*600*C"
{
  "raw": "MA5*DETECTED TEMPERATURE*600*C",
  "data": ["DETECTED TEMPERATURE", "600", "C"]
}
```

### Data Transformation Rules
1. **Temperature**: Divide by 100 for food machines, by 10 for beverage machines
2. **Currency**: Convert cents to dollars (divide by 100)
3. **Coin Types**: Map codes to denominations (00=0.10, 01=0.20, etc.)
4. **Error Filtering**: Extract ERROR records from MA5, all EA1-EA9 records

## Implementation Status

- ✅ **Raw DEX content fetcher with CSRF authentication**
- ✅ **Gzip decompression and DEX field parsing**
- ✅ **Lightweight API endpoints created**
- ✅ **Simplified data structures implemented**
- ✅ **Server-side caching (5 minutes)**
- ✅ **Frontend updated to use new APIs**
- ✅ **Comprehensive raw DEX data file (646KB with 49 machines)**
- ✅ **Performance optimization (95% size reduction for list views)**
- ✅ **Complete Supabase schema with company/location tables**
- ✅ **Documentation updated with all endpoints and processing logic**
- 🔄 **Demo data preserved for development**

## Testing

```bash
# Test summary endpoint
curl http://localhost:3300/api/machines/summary

# Test individual machine details
curl http://localhost:3300/api/machines/552234133196/details

# Test Supabase demo
curl http://localhost:3300/api/machines/supabase-demo
```

## Future Enhancements

1. **Real-time updates**: WebSocket support for live data
2. **Pagination**: For large machine fleets
3. **Filtering**: By location, type, status, errors
4. **Aggregations**: Fleet-wide statistics
5. **Alerts**: Proactive error notifications
6. **Mobile optimization**: Reduced data for mobile apps
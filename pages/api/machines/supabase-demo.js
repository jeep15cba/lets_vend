export const runtime = 'edge';

// Demo endpoint showing how future Supabase integration would work
export default async function handler(request) {
  if (request.method !== 'GET') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  try {
    // Simulate how we would query Supabase for machine summaries
    const mockSupabaseQuery = {
      table: 'machine_summaries',
      select: [
        'case_serial',
        'customer_name',
        'machine_type',
        'last_dex_update',
        'temperature_current',
        'temperature_target',
        'temperature_unit',
        'cash_total',
        'cash_denominations',
        'error_count',
        'product_count',
        'has_recent_data',
        'firmware'
      ],
      filters: {
        status: 'active'
      },
      orderBy: 'last_dex_update desc'
    };

    // Sample response structure that Supabase would return
    const mockSupabaseResponse = {
      data: [
        {
          case_serial: '552234133196',
          customer_name: 'Isavend',
          machine_type: 'food',
          last_dex_update: '2025-09-27T02:07:07.000Z',
          temperature_current: 6.0,
          temperature_target: 4.0,
          temperature_unit: 'C',
          cash_total: 15.40,
          cash_denominations: {
            '0.10': 59,
            '0.20': 40,
            '0.50': 28,
            '1.00': 27,
            '2.00': 37
          },
          error_count: 0,
          product_count: 70,
          has_recent_data: true,
          firmware: '1.8.18.1'
        }
      ],
      count: 49
    };

    // Transform to our standardized API format
    const transformedData = {};

    mockSupabaseResponse.data.forEach(record => {
      transformedData[record.case_serial] = {
        caseSerial: record.case_serial,
        customerName: record.customer_name,
        lastDexUpdate: record.last_dex_update,
        firmware: record.firmware,
        temperature: record.temperature_current ? {
          current: record.temperature_current.toString(),
          target: record.temperature_target?.toString(),
          unit: record.temperature_unit
        } : null,
        cash: record.cash_total ? {
          total: record.cash_total,
          denominations: record.cash_denominations
        } : null,
        errors: [], // Would be populated from separate errors table
        productCount: record.product_count,
        hasRecentData: record.has_recent_data
      };
    });

    return new Response(JSON.stringify({
      success: true,
      data: transformedData,
      totalMachines: mockSupabaseResponse.count,
      lastUpdated: new Date().toISOString(),
      source: 'supabase-demo',
      note: 'This is a demo endpoint showing how Supabase integration would work'
    }), {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=60' // Shorter cache for demo
      }
    });

  } catch (error) {
    console.error('Supabase demo API error:', error);
    return new Response(JSON.stringify({
      error: 'Failed to fetch from Supabase demo: ' + error.message
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

/*
Future Supabase Schema Example:

// Table: machines
CREATE TABLE machines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_serial VARCHAR(50) UNIQUE NOT NULL,
  customer_name VARCHAR(255),
  machine_type VARCHAR(20),
  machine_model VARCHAR(100),
  location VARCHAR(255),
  cash_enabled BOOLEAN DEFAULT false,
  status VARCHAR(20) DEFAULT 'active',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

// Table: dex_captures
CREATE TABLE dex_captures (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  machine_id UUID REFERENCES machines(id),
  case_serial VARCHAR(50) NOT NULL,
  dex_id BIGINT NOT NULL,
  raw_content TEXT,
  structured_data JSONB,
  firmware VARCHAR(50),
  capture_source VARCHAR(50),
  created_at TIMESTAMP DEFAULT NOW()
);

// Table: machine_summaries (materialized view)
CREATE MATERIALIZED VIEW machine_summaries AS
SELECT
  m.case_serial,
  m.customer_name,
  m.machine_type,
  dc.created_at as last_dex_update,
  (dc.structured_data->'temperature'->>'current')::FLOAT as temperature_current,
  (dc.structured_data->'temperature'->>'target')::FLOAT as temperature_target,
  dc.structured_data->'temperature'->>'unit' as temperature_unit,
  (dc.structured_data->'cash'->>'total')::FLOAT as cash_total,
  dc.structured_data->'cash'->'denominations' as cash_denominations,
  COALESCE(array_length(ARRAY(SELECT jsonb_array_elements(dc.structured_data->'errors')), 1), 0) as error_count,
  (dc.structured_data->>'productCount')::INT as product_count,
  (dc.created_at > NOW() - INTERVAL '4 hours') as has_recent_data,
  dc.firmware
FROM machines m
LEFT JOIN LATERAL (
  SELECT *
  FROM dex_captures dc2
  WHERE dc2.machine_id = m.id
  ORDER BY dc2.created_at DESC
  LIMIT 1
) dc ON true
WHERE m.status = 'active';

// Refresh function for real-time updates
CREATE OR REPLACE FUNCTION refresh_machine_summaries()
RETURNS void AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY machine_summaries;
END;
$$ LANGUAGE plpgsql;

// RLS policies for security
ALTER TABLE machines ENABLE ROW LEVEL SECURITY;
ALTER TABLE dex_captures ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view machines they have access to"
ON machines FOR SELECT
USING (auth.jwt() ->> 'role' = 'admin' OR auth.jwt() ->> 'customer_id' = customer_id);
*/
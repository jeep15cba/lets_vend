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

### 1. Machine Summaries `/api/machines/summary`

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
-- Core machine registry
CREATE TABLE machines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_serial VARCHAR(50) UNIQUE NOT NULL,
  customer_name VARCHAR(255),
  machine_type VARCHAR(20),
  location VARCHAR(255),
  cash_enabled BOOLEAN DEFAULT false
);

-- DEX data captures
CREATE TABLE dex_captures (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  machine_id UUID REFERENCES machines(id),
  dex_id BIGINT NOT NULL,
  raw_content TEXT,
  structured_data JSONB,
  firmware VARCHAR(50),
  created_at TIMESTAMP DEFAULT NOW()
);

-- Optimized summary view
CREATE MATERIALIZED VIEW machine_summaries AS
SELECT
  m.case_serial,
  m.customer_name,
  latest.structured_data->'temperature' as temperature,
  latest.structured_data->'cash' as cash,
  latest.structured_data->'errors' as errors,
  latest.created_at as last_dex_update
FROM machines m
LEFT JOIN LATERAL (
  SELECT * FROM dex_captures dc
  WHERE dc.machine_id = m.id
  ORDER BY created_at DESC LIMIT 1
) latest ON true;
```

## Implementation Status

- ✅ **Lightweight API endpoints created**
- ✅ **Simplified data structures implemented**
- ✅ **Caching added at API level**
- ✅ **Frontend updated to use new APIs**
- ✅ **Supabase integration pathway documented**
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
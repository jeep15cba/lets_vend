# DEX Data Fetching Process

This document explains the complete process for fetching DEX (Data Exchange) data from the Cantaloupe vending machine management system.

## Overview

DEX data contains critical machine information including:
- **CA17**: Cash denomination data (coin counts: $0.10, $0.20, $0.50, $1.00, $2.00)
- **CA1**: Cash box data
- **CA2**: Cash sales data
- **Temperature data**
- **Error codes**
- **Product sales data**

## Process Flow

### 1. Fetch Live DEX List
**Script**: `scripts/fetch-real-dex-list.js`
**Purpose**: Get complete DEX record list from live Cantaloupe API

```bash
node scripts/fetch-real-dex-list.js
```

**What it does**:
- Calls the existing `api/cantaloupe/dex-raw` endpoint
- Fetches up to 10,000 recent DEX records from live API
- Creates mapping of case serial → DEX ID
- Saves to `data/live-case-serial-dex-mapping.json`

**Output**:
```json
{
  "timestamp": "2025-09-24T07:16:22.703Z",
  "stats": {
    "totalDexRecords": 707,
    "uniqueMachines": 51,
    "ourMachinesMatched": 51
  },
  "mapping": {
    "CSA200202661": {
      "dexId": "23051244",
      "timestamp": "2025-09-24 07:16:14",
      "firmware": "1.0.119",
      "parsed": false,
      "customer": "Isavend"
    }
  }
}
```

### 2. Fetch Missing Parsed DEX Data
**Script**: `scripts/fetch-missing-dex-using-live-mapping.js`
**Purpose**: Use live mapping to fetch parsed DEX data for machines missing it

```bash
node scripts/fetch-missing-dex-using-live-mapping.js
```

**What it does**:
- Loads current machine inventory from `public/data/case-serial-dex-mapping-new.json`
- Loads live DEX ID mapping from step 1
- Identifies machines without parsed DEX data
- Fetches parsed data using `api/cantaloupe/get-parsed-dex`
- Updates `public/data/comprehensive-dex-data.json`

## API Endpoints Used

### `/api/cantaloupe/dex-raw`
- **Method**: GET
- **Purpose**: Fetch raw DEX records from live Cantaloupe API
- **Parameters**:
  - `length`: Number of records (default: 100, use 10000 for complete list)
  - `start`: Starting record offset
- **Returns**: JSON with DEX records including case serials and DEX IDs

### `/api/cantaloupe/get-parsed-dex`
- **Method**: POST
- **Purpose**: Get parsed/structured DEX data for a specific DEX ID
- **Body**: `{ "dexId": "23051244" }`
- **Returns**: Structured DEX data with CA17, CA1, CA2 fields

### `/api/cantaloupe/auth`
- **Method**: POST
- **Purpose**: Authenticate with Cantaloupe dashboard
- **Returns**: Session cookies for API access

## File Structure

```
├── scripts/
│   ├── fetch-real-dex-list.js              # Step 1: Get live DEX mapping
│   ├── update-mapping-with-live-dex.js     # Step 2: Update mapping file
│   ├── fetch-missing-dex-using-live-mapping.js # Step 3: Fetch missing parsed data
│   ├── fetch-all-dex-data.js               # Legacy: Fetch all DEX data
│   └── fetch-missing-dex-data.js           # Legacy: Use mock API
├── data/
│   └── live-case-serial-dex-mapping.json   # Live DEX ID mapping
├── public/data/
│   ├── case-serial-dex-mapping-new.json    # Machine inventory
│   └── comprehensive-dex-data.json         # Complete parsed DEX data
└── pages/api/cantaloupe/
    ├── dex-raw.js                          # Live DEX list API
    ├── get-parsed-dex.js                   # Parse specific DEX ID
    └── auth.js                             # Authentication
```

## Data Flow

```
Live Cantaloupe API
        ↓
  dex-raw.js endpoint
        ↓
fetch-real-dex-list.js
        ↓
live-case-serial-dex-mapping.json
        ↓
fetch-missing-dex-using-live-mapping.js
        ↓
comprehensive-dex-data.json
        ↓
    /devices page
```

## Complete Process

### Full Refresh (when needed)
```bash
# Step 1: Get latest DEX IDs from live API
node scripts/fetch-real-dex-list.js

# Step 2: Update mapping file with live DEX data
node scripts/update-mapping-with-live-dex.js

# Step 3: Fetch parsed data for missing machines
node scripts/fetch-missing-dex-using-live-mapping.js
```

### Quick Update (daily/regular)
```bash
# Only fetch missing data using existing mapping
node scripts/fetch-missing-dex-using-live-mapping.js

# Optional: Update mapping if new machines found
node scripts/update-mapping-with-live-dex.js
```

## Expected Results

After running both scripts:
- **All 51 machines** have DEX data
- **14+ machines** have CA17 cash denomination data
- **10+ machines** have CA1 cash box data
- **32+ machines** have CA2 cash sales data
- `/devices` page shows real cash amounts instead of placeholders

## Troubleshooting

### Common Issues

1. **500 Server Error on DEX list**
   - The live `/dex/getData` endpoint sometimes returns 500 errors
   - Solution: Use `dex-raw.js` which handles authentication and retry logic

2. **Authentication Failures**
   - Cookies expire or become invalid
   - Solution: Scripts automatically re-authenticate when needed

3. **Missing DEX IDs**
   - Some machines may not have recent DEX records
   - Check `live-case-serial-dex-mapping.json` for coverage

4. **Parse Errors**
   - Some DEX records may not parse correctly
   - Check `comprehensive-dex-data.json` errors array

### Debug Commands

```bash
# Test dex-raw API directly
curl "http://localhost:3300/api/cantaloupe/dex-raw?length=10"

# Check current comprehensive data
node -e "console.log(Object.keys(require('./public/data/comprehensive-dex-data.json').results).length)"

# Count machines with CA17 data
node scripts/analyze-cash-data.js
```

## Historical Context

- **Original approach**: Used mock API with limited data
- **Current approach**: Calls live Cantaloupe API for real-time data
- **Key insight**: The `/dex` endpoint returns 500 errors, but `/dex-raw.js` handles this properly
- **Previous limitation**: Only 26/51 machines had DEX data
- **Current status**: All 51/51 machines have complete DEX data

## Maintenance

### Regular Tasks
- Run daily to catch new DEX uploads
- Monitor cash data coverage in `/devices` page
- Check for new machines in inventory

### When to Full Refresh
- New machines added to inventory
- Significant changes to DEX data structure
- After long periods without updates (weekly)

## Integration

The fetched DEX data is consumed by:
- **`components/Devices.js`**: Displays cash denominations and totals
- **Dashboard analytics**: Machine performance tracking
- **Cash reconciliation**: Daily cash amount verification
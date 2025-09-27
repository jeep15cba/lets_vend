# DEX Data Fetching Process

This document explains the complete process for fetching DEX (Data Exchange) data from the Cantaloupe vending machine management system.

## Overview

DEX data contains critical machine information including:
- **DXS**: Header with device identifiers and version info
- **ST**: Start transaction data
- **BA1**: Bill acceptor data
- **CA1-CA15**: Cashless/card reader data sections
- **CB1**: Coin mechanism data
- **DA2**: Device activity data
- **MA5**: Machine status (temperature readings)
- **PA1-PA2**: Product activity data
- **Raw telemetry**: Complete vending machine operational data

## Modern Process Flow (2025)

### 1. Get Latest DEX Metadata
**API Endpoint**: `/api/cantaloupe/dex-raw`
**Purpose**: Fetch DEX metadata including latest DEX IDs for each machine

```bash
curl -X POST "http://localhost:3300/api/cantaloupe/dex-raw?length=1000" \
     -H "Content-Type: application/json" \
     -d '{"cookies": "auth_cookies_here"}'
```

**What it does**:
- Calls Cantaloupe `/dex` endpoint with DataTables parameters
- Fetches up to 1000 recent DEX records with metadata
- Groups by machine (caseSerial) to find latest DEX ID for each
- Returns metadata including DEX IDs, timestamps, parsing status

**Response Format**:
```json
{
  "success": true,
  "data": {
    "recordsTotal": 47214,
    "data": [
      {
        "devices": {"caseSerial": "552234133196"},
        "customers": {"name": "Isavend"},
        "dexRaw": {
          "id": 23204016,
          "created": "2025-09-27 02:07:07",
          "parsed": 1,
          "uploadReason": 0,
          "dexSource": "Device",
          "firmware": "1.8.18.1"
        }
      }
    ]
  }
}
```

### 2. Fetch Actual Raw DEX Content
**API Endpoint**: `/api/fetch-raw-dex-content`
**Purpose**: Use DEX IDs to fetch actual raw DEX content for each machine

```bash
curl -X POST "http://localhost:3300/api/fetch-raw-dex-content" \
     -H "Content-Type: application/json" \
     -H "Origin: http://localhost:3300"
```

**What it does**:
- Reads latest DEX IDs from `comprehensive-raw-dex-data.json`
- Authenticates with Cantaloupe dashboard and extracts CSRF token
- Makes requests to `/dex/getRawDex/{dexId}` for each machine
- Updates file with actual raw DEX content

**Output File**: `public/data/comprehensive-raw-dex-data.json`
```json
{
  "timestamp": "2025-09-27T02:07:07.000Z",
  "note": "Comprehensive list of all machines with latest DEX ID and actual raw DEX content",
  "totalMachines": 49,
  "machines": {
    "552234133196": {
      "caseSerial": "552234133196",
      "customerName": "Isavend",
      "latestDexId": 23204016,
      "latestDexCreated": "2025-09-27 02:07:07",
      "latestDexMetadata": {
        "parsed": 1,
        "uploadReason": 0,
        "dexSource": "Device",
        "firmware": "1.8.18.1"
      },
      "rawDexContent": "DXS*RST7654321*VA*V0/6*1\r\nST*001*0001\r\nBA1*0350Y500014 *T7          *1200\r\nCA1*3040GD25630 *GRYPHON 3C3 *1070\r\nCA2*216520*633*0*0\r\nCA3*0*0*0*0*406760*39080*146680*221000\r\n...",
      "rawDexType": "text",
      "fetchedAt": "2025-09-27T02:22:58.410Z"
    }
  }
}
```

## API Endpoints Used

### `/api/cantaloupe/dex-raw`
- **Method**: POST
- **Purpose**: Fetch DEX metadata from live Cantaloupe API
- **Parameters**:
  - `length`: Number of records (default: 100, use 1000 for comprehensive list)
  - `start`: Starting record offset (optional)
- **Body**: `{ "cookies": "auth_cookies_here" }` (optional, will auto-authenticate)
- **Returns**: JSON with DEX metadata including case serials, DEX IDs, timestamps
- **Cantaloupe Endpoint**: `https://dashboard.cantaloupe.online/dex` (POST with DataTables format)

### `/api/fetch-raw-dex-content`
- **Method**: POST
- **Purpose**: Fetch actual raw DEX content using DEX IDs
- **Authentication**: Automatic (calls `/api/cantaloupe/auth` internally)
- **Process**:
  1. Loads DEX IDs from comprehensive-raw-dex-data.json
  2. Extracts CSRF token from dashboard
  3. Calls `/dex/getRawDex/{dexId}` for each machine
- **Returns**: Complete machine data with raw DEX content
- **Cantaloupe Endpoint**: `https://dashboard.cantaloupe.online/dex/getRawDex/{dexId}` (POST with CSRF)

### `/api/cantaloupe/auth`
- **Method**: POST
- **Purpose**: Authenticate with Cantaloupe dashboard
- **Environment Variables Required**:
  - `CANTALOUPE_USERNAME`
  - `CANTALOUPE_PASSWORD`
- **Returns**: Session cookies for API access
- **Process**: Performs login and extracts session cookies

### `/api/cantaloupe/dex-data` (Individual Machine)
- **Method**: POST
- **Purpose**: Get raw DEX content for a specific machine
- **Parameters**: `?machineId=CSA200202688`
- **Body**: `{ "cookies": "auth_cookies_here" }` (optional)
- **Returns**: Raw DEX data for single machine
- **Cantaloupe Endpoint**: `https://dashboard.cantaloupe.online/dex/getRawDex/{machineId}`

## File Structure

```
├── pages/api/
│   ├── fetch-raw-dex-content.js            # NEW: Fetch actual raw DEX content
│   ├── generate-comprehensive-raw-dex.js   # Generate comprehensive DEX metadata
│   ├── update-comprehensive-raw-dex.js     # Update existing comprehensive data
│   └── cantaloupe/
│       ├── dex-raw.js                      # DEX metadata API
│       ├── dex-data.js                     # Individual machine DEX data
│       └── auth.js                         # Authentication
├── public/data/
│   ├── comprehensive-raw-dex-data.json     # MAIN: Latest DEX IDs + raw content
│   └── comprehensive-dex-data.json         # LEGACY: Parsed DEX data
└── docs/
    └── DEX-DATA-FETCHING.md                # This documentation
```

## Data Flow (Modern 2025)

```
Cantaloupe Dashboard API
        ↓
1. /api/cantaloupe/dex-raw
   (Get DEX metadata & IDs)
        ↓
2. comprehensive-raw-dex-data.json
   (Latest DEX ID for each machine)
        ↓
3. /api/fetch-raw-dex-content
   (Fetch actual raw DEX using IDs)
        ↓
4. comprehensive-raw-dex-data.json
   (Complete with raw DEX content)
        ↓
5. /devices page & components
   (Display real machine data)
```

## Complete Process (Modern 2025)

### Option 1: API Endpoints (Recommended)
```bash
# Step 1: Generate/update comprehensive DEX metadata file
curl -X POST "http://localhost:3300/api/generate-comprehensive-raw-dex"

# Step 2: Fetch actual raw DEX content for all machines
curl -X POST "http://localhost:3300/api/fetch-raw-dex-content"
```

### Option 2: Individual Updates
```bash
# Update just the metadata (DEX IDs and timestamps)
curl -X POST "http://localhost:3300/api/update-comprehensive-raw-dex"

# Get raw DEX for specific machine
curl -X POST "http://localhost:3300/api/cantaloupe/dex-data?machineId=CSA200202688"
```

### Option 3: Direct Cantaloupe API (Advanced)
```bash
# Get DEX metadata directly
curl -X POST "http://localhost:3300/api/cantaloupe/dex-raw?length=1000"

# Authenticate and get cookies
curl -X POST "http://localhost:3300/api/cantaloupe/auth"
```

## Expected Results

After running the modern process:
- **All 49 machines** have latest DEX metadata (DEX IDs, timestamps)
- **All 49 machines** have actual raw DEX content
- **Raw DEX data includes**:
  - DXS headers with device identifiers
  - BA1 bill acceptor data
  - CA1-CA15 cashless/card reader sections
  - CB1 coin mechanism data
  - DA2 device activity data
  - MA5 machine status (temperature readings)
  - PA1-PA2 product activity data
- `/devices` page shows real vending machine telemetry

## Raw DEX Content Format

The raw DEX content follows the standard DEX format:
```
DXS*RST7654321*VA*V0/6*1
ST*001*0001
BA1*0350Y500014 *T7          *1200
CA1*3040GD25630 *GRYPHON 3C3 *1070
CA2*216520*633*0*0
CA3*0*0*0*0*406760*39080*146680*221000
CA4*0*0*181200*3830
CA7*0*0*0*0
CA8*0*1630
CA10*0*0
CA14*247000**0
CA15*12890
CB1***V8.22/210310
DA2*533120*1328*620*1
MA5*DESIRED TEMPERATURE*  400*C
MA5*DETECTED TEMPERATURE*  600*C
PA1*10*360
PA2*53*19080*0*0*0*0*0*0
```

Each line contains different telemetry data separated by `*` characters.

## Troubleshooting

### Common Issues

1. **419 Authentication Errors**
   - CSRF token missing or expired
   - Solution: The `/api/fetch-raw-dex-content` endpoint automatically extracts CSRF tokens

2. **Authentication Failures**
   - Environment variables missing: `CANTALOUPE_USERNAME`, `CANTALOUPE_PASSWORD`
   - Solution: Check .env.local file and credentials

3. **Empty Raw DEX Content**
   - Some machines may not have recent DEX uploads
   - Check `latestDexCreated` timestamp in comprehensive-raw-dex-data.json

4. **Network Timeouts**
   - Fetching all machines takes 15+ minutes
   - Solution: API includes rate limiting (300ms delays) to avoid overwhelming Cantaloupe

### Debug Commands

```bash
# Test authentication
curl -X POST "http://localhost:3300/api/cantaloupe/auth"

# Test DEX metadata fetching
curl -X POST "http://localhost:3300/api/cantaloupe/dex-raw?length=10"

# Test individual machine DEX content
curl -X POST "http://localhost:3300/api/cantaloupe/dex-data?machineId=CSA200202688"

# Check comprehensive data structure
cat public/data/comprehensive-raw-dex-data.json | jq '.totalMachines'

# Count machines with actual content
cat public/data/comprehensive-raw-dex-data.json | jq '[.machines[] | select(.rawDexContent != null)] | length'
```

## Historical Context

- **Original approach (2024)**: Used scripts with parsed DEX data
- **Modern approach (2025)**: API endpoints with raw DEX content
- **Key improvements**:
  - Direct API access instead of scripts
  - CSRF token handling for authentication
  - Raw DEX content (not just parsed metadata)
  - Real-time machine telemetry data
- **Previous limitation**: Only parsed DEX summaries
- **Current status**: All 49/49 machines have complete raw DEX content

## Authentication Requirements

The system requires valid Cantaloupe dashboard credentials:

```env
# .env.local
CANTALOUPE_USERNAME=your_username
CANTALOUPE_PASSWORD=your_password
```

The authentication process:
1. Logs into `https://dashboard.cantaloupe.online/login`
2. Extracts session cookies
3. Fetches CSRF token from dashboard page
4. Uses cookies + CSRF for API requests

## Maintenance

### Regular Tasks (Automated via API)
```bash
# Daily: Update DEX metadata and content
curl -X POST "http://localhost:3300/api/fetch-raw-dex-content"
```

### Manual Monitoring
- Check `/devices` page for real telemetry data
- Monitor `comprehensive-raw-dex-data.json` file size and update timestamps
- Verify all machines have `rawDexContent` populated

### When to Full Refresh
- New machines added to inventory
- After authentication credential changes
- When comprehensive data file becomes corrupted

## Integration

The raw DEX data is consumed by:
- **`components/Devices.js`**: Displays machine telemetry and status
- **Dashboard analytics**: Real-time machine performance tracking
- **Cash reconciliation**: Accurate cash/sales data from CA sections
- **Temperature monitoring**: MA5 temperature readings
- **Product tracking**: PA1/PA2 product sales data
- **Maintenance alerts**: Error codes and device status

## Security Notes

- **Credentials**: Store in .env.local, never commit to repository
- **Rate Limiting**: Built-in 300ms delays to respect Cantaloupe API
- **CSRF Protection**: Automatically handled by fetch-raw-dex-content endpoint
- **Session Management**: Cookies automatically refreshed when expired
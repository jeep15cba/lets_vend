# Devices Data Fetching Process

This document explains the process for fetching device/machine data from the Cantaloupe vending machine management system.

## Overview

Device data contains machine inventory and status information including:
- **Case Serial Numbers**: Unique machine identifiers
- **Machine Locations**: Where machines are deployed
- **Last Seen**: Connection status and timestamps
- **Firmware Version**: Current software version
- **Temperature**: Machine temperature readings
- **Error Bits**: System error codes
- **Signal Strength**: Network connectivity
- **Machine Names/Types**: Model and configuration info

## API Endpoint

### `/api/cantaloupe/devices-raw`
- **Method**: GET or POST
- **Purpose**: Fetch complete machine inventory from live Cantaloupe API
- **Authentication**: Automatic (handles auth internally)

## Process Flow

### 1. Authentication
The API automatically handles authentication:
- Checks for existing cookies in request
- If no cookies, calls `/api/cantaloupe/auth` to get fresh session
- Extracts CSRF token from dashboard page

### 2. Data Fetching
Makes POST request to `https://dashboard.cantaloupe.online/devices/getData` with:
- **DataTables format**: Pagination and sorting parameters
- **Exact browser headers**: Mimics real browser request
- **CSRF protection**: Includes valid token

### 3. Response Processing
- Parses JSON response from Cantaloupe
- Returns structured device data
- Handles errors gracefully

## Usage Examples

### Basic Usage
```bash
# Get first 100 devices
curl "http://localhost:3300/api/cantaloupe/devices-raw"

# Get specific range
curl "http://localhost:3300/api/cantaloupe/devices-raw?start=100&length=50"
```

### From JavaScript
```javascript
const response = await fetch('/api/cantaloupe/devices-raw');
const data = await response.json();

console.log(`Found ${data.data.recordsTotal} total devices`);
console.log(`Showing ${data.data.data.length} devices`);
```

## Response Format

```json
{
  "success": true,
  "type": "json",
  "data": {
    "draw": "1",
    "recordsTotal": 57,
    "recordsFiltered": 57,
    "data": [
      {
        "devices": {
          "id": 2684,
          "lastSeen": "2025-09-24 00:28:25",
          "caseSerial": "CSA200202681",
          "temp": "22.5",
          "error_bits": "0",
          "signalStr": "-65 dBm",
          "firmwareStr": "1.0.119"
        },
        "customers": {
          "name": "Isavend"
        }
      }
    ]
  },
  "responseLength": 101963,
  "timestamp": "2025-09-24T07:30:00.000Z"
}
```

## Data Fields

### Device Information
- `devices.caseSerial`: Unique machine identifier
- `devices.lastSeen`: Last communication timestamp
- `devices.temp`: Temperature reading in Celsius
- `devices.error_bits`: System error code bitmask
- `devices.signalStr`: Network signal strength
- `devices.firmwareStr`: Firmware version
- `devices.vmName`: Vending machine model/type
- `devices.uptime`: Machine uptime

### Customer/Location
- `customers.name`: Customer/operator name
- `devices_location`: Physical location description

### DEX Integration
- `dexRaw.created`: Last DEX upload timestamp
- Links to DEX data fetching process

## Parameters

### Pagination
- `start`: Starting record offset (default: 0)
- `length`: Number of records to return (default: 100)

### Filtering
- `show_banned`: Include banned devices (default: false)
- `show_inv`: Show inventory devices (default: false)
- `show_online`: Online devices only (default: false)
- `device_type_select`: Filter by device type

### Sorting
- Default: Sort by `lastSeen` descending (most recent first)
- Configurable via DataTables parameters

## Integration Points

### Machine Inventory Management
The devices-raw API is used by:
- **Machine mapping scripts**: Building case serial inventories
- **Status monitoring**: Checking machine health
- **Location tracking**: Managing deployment locations

### Related Scripts
```bash
# Capture all case serials from live API
curl "/api/cantaloupe/devices-raw?length=1000" | jq '.data.data[].devices.caseSerial'

# Check machines that haven't reported recently
curl "/api/cantaloupe/devices-raw" | jq '.data.data[] | select(.devices.lastSeen < "2025-09-23")'
```

## Error Handling

### Common Issues

1. **Authentication Failures**
   ```
   Error: Authentication failed
   ```
   - Solution: API automatically retries authentication
   - Check Cantaloupe dashboard access

2. **CSRF Token Missing**
   ```
   Error: 403 Forbidden
   ```
   - Solution: API extracts token from dashboard page
   - May indicate session expiry

3. **Rate Limiting**
   ```
   Error: 429 Too Many Requests
   ```
   - Solution: Add delays between requests
   - Use pagination instead of large requests

4. **Network Issues**
   ```
   Error: Failed to fetch raw devices data
   ```
   - Check network connectivity to dashboard.cantaloupe.online
   - Verify API server is running on port 3300

## Debugging

### Test API Directly
```bash
# Basic test
curl -v "http://localhost:3300/api/cantaloupe/devices-raw?length=1"

# Check authentication
curl -X POST "http://localhost:3300/api/cantaloupe/auth"

# Monitor server logs
# Check Next.js console for detailed request/response logs
```

### Verify Data Quality
```javascript
// Check for missing case serials
const response = await fetch('/api/cantaloupe/devices-raw?length=1000');
const data = await response.json();
const missingSerials = data.data.data.filter(device => !device.devices?.caseSerial);
console.log('Devices missing case serials:', missingSerials.length);

// Check last seen dates
const staleDevices = data.data.data.filter(device => {
  const lastSeen = new Date(device.devices.lastSeen);
  const daysSince = (Date.now() - lastSeen.getTime()) / (1000 * 60 * 60 * 24);
  return daysSince > 7;
});
console.log('Devices not seen in 7+ days:', staleDevices.length);
```

## Comparison with DEX Data Process

| Aspect | Devices Data | DEX Data |
|--------|--------------|----------|
| **Endpoint** | `/devices/getData` | `/dex/getData` |
| **Content** | Machine inventory & status | Transaction & cash data |
| **Update Frequency** | Real-time status | Periodic uploads |
| **Primary Use** | Machine management | Financial tracking |
| **Key Fields** | caseSerial, lastSeen, temp | CA17, CA1, CA2 cash data |

## Data Flow

```
Live Cantaloupe API
        ↓
/devices/getData endpoint
        ↓
  devices-raw.js API
        ↓
  Machine Status Data
        ↓
Status monitoring & inventory
```

## Maintenance

### Regular Monitoring
- Check for new machines appearing
- Monitor machines going offline (lastSeen > 24 hours)
- Track firmware versions across fleet
- Monitor temperature and error conditions

### Troubleshooting Workflow
1. Test basic API access: `curl /api/cantaloupe/devices-raw?length=1`
2. Check authentication: Verify cookies in browser dev tools
3. Monitor server logs: Look for CSRF token extraction
4. Validate data: Check for missing case serials or stale timestamps

## Historical Context

- **Purpose**: Provides live machine inventory and status
- **Authentication**: Uses same session-based auth as DEX data
- **Reliability**: More stable than direct dashboard scraping
- **Integration**: Foundation for DEX data case serial mapping

This API serves as the authoritative source for machine inventory and is the starting point for all other data collection processes.
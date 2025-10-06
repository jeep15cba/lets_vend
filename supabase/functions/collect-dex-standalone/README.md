# DEX Collection Edge Function

Production-ready Supabase Edge Function for automated DEX (vending machine data) collection from Cantaloupe API.

## Features

✅ **Full DEX Collection Pipeline**
- Authenticates with Cantaloupe dashboard
- Fetches DEX metadata (100 most recent records from last 24 hours)
- Downloads raw DEX content for each record
- Deduplicates against existing records in database

✅ **Complete DEX Parsing**
- Parses raw DEX data into structured format
- Extracts coin tube data (CA17)
- Parses temperature readings (MA5 TEMP)
- Captures error codes (MA5 ERROR)
- Records events (EA1/EA2 - door opens, jams, etc.)
- Extracts product sales data (PA1/PA2)
- Calculates sales totals (VA1)

✅ **Database Integration**
- Saves to `dex_captures` with complete `parsed_data`
- Sets correct `machine_id` via case_serial lookup
- Updates machine records with latest DEX info
- Updates 4-hour DEX flags for all machines
- Maintains `dex_history` (last 100 entries per machine)

✅ **Edge Runtime Compatible**
- No Node.js dependencies
- Uses Web Crypto API for encryption
- ES6 modules only (no CommonJS require)
- Runs on Deno/Cloudflare Workers

## Configuration

**Date Range:** Last 24 hours
**Record Limit:** 100 records per run
**Recommended Schedule:** Every 15-30 minutes via pg_cron

## Schema

Saves to `dex_captures` table:
```typescript
{
  dex_id: string,              // Unique DEX ID from Cantaloupe
  machine_id: uuid,            // FK to machines table
  case_serial: string,         // Machine case serial number
  company_id: uuid,            // FK to companies table
  raw_content: text,           // Raw DEX data as text
  parsed_data: jsonb,          // Structured parsed data
  has_errors: boolean,         // Whether errors were detected
  record_count: integer,       // Number of lines in DEX
  created_at: timestamp        // Actual DEX creation time
}
```

Updates `machines` table:
- `latest_dex_data` - timestamp of most recent DEX
- `latest_dex_parsed` - parsed data for device cards
- `dex_last_capture` - last capture timestamp
- `dex_last_4hrs` - count of DEX in last 4 hours
- `dex_history` - array of last 100 DEX entries

## Parsed Data Structure

```typescript
{
  hybridData: {
    summary: {
      totalSales: string,
      totalVends: string,
      hasErrors: boolean,
      temperature: string,
      temperatureUnit: string,
      errorCodes: string
    },
    keyValue: {
      // Raw key-value pairs
    },
    keyValueGroups: {
      sales: {
        // VA1 totals + CA17 coin tube data
        "va1_total_sales_value": "123.45",
        "ca17_tube_00_denomination": "0.10",
        "ca17_tube_00_count": "38"
      },
      products: {
        // PA1/PA2 product data
      },
      diagnostics: {
        // MA5 temperature and errors
      },
      events: {
        // EA1/EA2 event data
      }
    }
  },
  deviceCardData: {
    // Optimized for UI display
  }
}
```

## Deployment

```bash
# Deploy function
supabase functions deploy collect-dex-standalone

# Invoke manually
curl --request POST 'https://YOUR_PROJECT.supabase.co/functions/v1/collect-dex-standalone' \
  --header 'Authorization: Bearer YOUR_ANON_KEY' \
  --header 'Content-Type: application/json'
```

## Comparison to /collect-bulk

This Edge Function is a full replacement for the Next.js `/api/dex/collect-bulk` endpoint:

| Feature | collect-bulk (Next.js) | collect-dex-standalone (Edge) |
|---------|----------------------|-------------------------------|
| Runtime | Node.js / Cloudflare Pages | Deno / Edge Runtime |
| Dependencies | Node.js libraries | Pure JS, Web APIs only |
| Parsing | All 3 parsers | Hybrid parser (full featured) |
| Scheduling | Manual / cron job | pg_cron compatible |
| Performance | Slower (50 req limit) | Faster (edge runtime) |
| Cost | Cloudflare Pages costs | Supabase Edge Function costs |

## Notes

- Function requires `user_credentials` table with Cantaloupe credentials
- Uses RLS (Row Level Security) for company data isolation
- Handles authentication, CSRF tokens, and session cookies automatically
- Automatically skips duplicate records
- Logs detailed progress for debugging

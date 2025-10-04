# DEX History Tracking Implementation

## Overview

The DEX history tracking feature stores a complete history of DEX records for each machine in the `machines.dex_history` JSONB column. This allows tracking all DEX data back to the specific `caseSerial`.

## Database Schema Changes

### New Column: `dex_history`

```sql
-- Add dex_history column to machines table
ALTER TABLE machines
ADD COLUMN dex_history JSONB DEFAULT '[]'::jsonb;

-- Add GIN index for efficient JSON queries
CREATE INDEX idx_machines_dex_history_gin ON machines USING gin (dex_history);
```

## Data Structure

The `dex_history` column stores an array of DEX record objects:

```json
[
  {
    "dexId": "23489710",
    "created": "2025-09-27 02:07:07"
  },
  {
    "dexId": "23489711",
    "created": "2025-09-27 03:15:22"
  }
]
```

### Field Descriptions

- `dexId`: The unique DEX record identifier from Cantaloupe (string)
- `created`: The timestamp when the DEX record was created (ISO format string)

## Implementation Details

### Bulk Collection Integration

The DEX history is automatically updated during bulk collection in `/api/dex/collect-bulk`:

1. **Fetch Current History**: Retrieves existing `dex_history` for machines being updated
2. **Build New Entries**: Creates new DEX history entries from processed records
3. **Merge & Deduplicate**: Combines new entries with existing history, removing duplicates
4. **Sort & Limit**: Sorts by creation date (newest first) and limits to 100 most recent entries
5. **Update Database**: Saves the updated history back to the machines table

### Key Features

- **Automatic Deduplication**: Prevents duplicate DEX IDs in history
- **Size Management**: Limits history to 100 most recent entries per machine
- **Chronological Ordering**: Newest records appear first
- **Performance Optimized**: Uses GIN index for efficient JSON queries

## Usage Examples

### Query DEX History for a Machine

```sql
-- Get all DEX history for a specific machine
SELECT case_serial, dex_history
FROM machines
WHERE case_serial = 'CSA200202679';

-- Count DEX records per machine
SELECT
  case_serial,
  jsonb_array_length(dex_history) as dex_count
FROM machines
WHERE dex_history IS NOT NULL;

-- Find machines with specific DEX ID
SELECT case_serial, dex_history
FROM machines
WHERE dex_history @> '[{"dexId": "23489710"}]';

-- Get latest DEX record for each machine
SELECT
  case_serial,
  dex_history->0->>'dexId' as latest_dex_id,
  dex_history->0->>'created' as latest_created
FROM machines
WHERE jsonb_array_length(dex_history) > 0;
```

### Application Usage

```javascript
// Access DEX history in application code
const machine = await supabase
  .from('machines')
  .select('case_serial, dex_history')
  .eq('case_serial', 'CSA200202679')
  .single()

const latestDex = machine.dex_history[0] // Newest record
const totalDexCount = machine.dex_history.length
const hasRecentDex = machine.dex_history.some(dex =>
  new Date(dex.created) > new Date(Date.now() - 24*60*60*1000) // Last 24 hours
)
```

## Benefits

1. **Complete Audit Trail**: Track all DEX records associated with each machine
2. **Historical Analysis**: Analyze patterns and frequency of DEX uploads
3. **Troubleshooting**: Quickly identify when specific DEX records were collected
4. **Performance**: Fast JSON queries using GIN indexes
5. **Efficient Storage**: JSONB format provides optimal storage and query performance

## Maintenance

The system automatically:
- Adds new DEX records to history during bulk collection
- Prevents duplicate entries
- Limits history size to prevent unbounded growth
- Maintains chronological order for easy access

## Integration Points

- **Bulk Collection**: `/api/dex/collect-bulk` - Automatically updates DEX history
- **Machine Updates**: History is preserved during machine data updates
- **API Responses**: DEX history can be included in machine API responses
- **Dashboard**: Can display DEX collection frequency and recent activity

## Monitoring Queries

```sql
-- Machines with most DEX activity
SELECT
  case_serial,
  jsonb_array_length(dex_history) as dex_count
FROM machines
ORDER BY dex_count DESC
LIMIT 10;

-- Recent DEX activity (last 24 hours)
SELECT
  case_serial,
  jsonb_array_length(
    (SELECT jsonb_agg(entry)
     FROM jsonb_array_elements(dex_history) entry
     WHERE (entry->>'created')::timestamp > NOW() - INTERVAL '24 hours')
  ) as recent_dex_count
FROM machines;

-- Average DEX records per machine
SELECT AVG(jsonb_array_length(dex_history)) as avg_dex_per_machine
FROM machines
WHERE dex_history IS NOT NULL;
```
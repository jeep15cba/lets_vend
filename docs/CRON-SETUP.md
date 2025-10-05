# Automated DEX Data Collection with Supabase Cron

This document explains how to set up automated DEX data collection that runs independently of your local server.

## Problem

The current scheduler (`/api/dex/scheduler`) requires:
- Manual triggering via HTTP POST request
- User authentication
- Local server or Pages deployment to be running

This means DEX data collection stops when your local server is down.

## ✅ Solution Implemented

We've implemented a **Supabase Edge Function + pg_cron** solution that:
- ✅ Runs automatically every 5 minutes on Supabase's infrastructure
- ✅ Collects DEX data for ALL companies (no user auth needed)
- ✅ Uses service-level authentication to bypass RLS
- ✅ Works independently of your Cloudflare Pages deployment
- ✅ Completely serverless and maintenance-free

## Quick Deployment Guide

### Step 1: Set Environment Variables

Add these to your Cloudflare Pages environment variables:

```bash
# Generate a random secret key (e.g., using: openssl rand -hex 32)
SERVICE_API_KEY=your-random-secret-key-here

# Your Supabase service role key (found in Supabase Dashboard → Settings → API)
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key-here
```

### Step 2: Deploy the Edge Function

```bash
# Install Supabase CLI
npm install -g supabase

# Login to Supabase
supabase login

# Link to your project
supabase link --project-ref your-project-ref

# Deploy the Edge Function
supabase functions deploy collect-dex

# Set Edge Function secrets
supabase secrets set SITE_URL=https://your-pages-url.pages.dev
supabase secrets set SERVICE_API_KEY=same-secret-key-as-above
```

### Step 3: Enable pg_cron and Schedule the Job

Run this in your Supabase SQL Editor:

```sql
-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS http;

-- Schedule DEX collection every 5 minutes
SELECT cron.schedule(
  'dex-collection-every-5-minutes',
  '*/5 * * * *',
  $$
  SELECT
    net.http_post(
      url:='https://YOUR-PROJECT-REF.supabase.co/functions/v1/collect-dex',
      headers:='{"Content-Type": "application/json", "Authorization": "Bearer YOUR-ANON-KEY"}'::jsonb
    ) AS request_id;
  $$
);
```

Replace:
- `YOUR-PROJECT-REF` with your Supabase project reference
- `YOUR-ANON-KEY` with your Supabase anon/public key

### Step 4: Verify It's Working

```sql
-- View scheduled jobs
SELECT * FROM cron.job;

-- View recent job runs (after waiting 5 minutes)
SELECT
  job_id,
  start_time,
  end_time,
  status,
  return_message
FROM cron.job_run_details
WHERE jobid = (SELECT jobid FROM cron.job WHERE jobname = 'dex-collection-every-5-minutes')
ORDER BY start_time DESC
LIMIT 10;
```

Check Edge Function logs in Supabase Dashboard → Edge Functions → Logs

## How It Works

```
┌─────────────────────────────────────────────────────────────┐
│  Supabase pg_cron (runs every 5 minutes)                    │
│  - Triggers HTTP request to Edge Function                   │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│  Supabase Edge Function (collect-dex)                       │
│  - Runs on Supabase infrastructure                          │
│  - Uses service role (bypasses RLS)                         │
│  - Fetches all companies with DEX credentials               │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│  For each company:                                           │
│  - Call /api/dex/collect-bulk with service auth             │
│  - Headers: X-Service-Key, X-Company-ID                     │
│  - Collects DEX data from Cantaloupe                        │
│  - Saves to Supabase database                               │
└─────────────────────────────────────────────────────────────┘
```

## Alternative Solution Options (Not Recommended)

### Option 1: Supabase pg_cron (Recommended)

Supabase includes PostgreSQL's `pg_cron` extension which can trigger HTTP requests on a schedule.

#### Setup Steps:

1. **Enable pg_cron in Supabase**:
   - Go to your Supabase Dashboard → Database → Extensions
   - Enable the `pg_cron` extension

2. **Create a Supabase Edge Function** to handle the cron job:
   - This function will call your `/api/dex/collect-bulk` endpoint
   - It will use service role authentication (bypassing RLS)
   - It will process all companies with active machines

3. **Schedule the cron job** in Supabase SQL Editor:
   ```sql
   -- Run DEX collection every 5 minutes for all companies
   SELECT cron.schedule(
     'dex-collection-every-5-minutes',
     '*/5 * * * *',  -- Every 5 minutes
     $$
     SELECT
       net.http_post(
         url:='https://your-supabase-project.supabase.co/functions/v1/collect-dex',
         headers:='{"Content-Type": "application/json", "Authorization": "Bearer YOUR_ANON_KEY"}'::jsonb
       ) AS request_id;
     $$
   );
   ```

### Option 2: External Cron Service (Simple Alternative)

Use a free cron service to call your API endpoint:

**Services**:
- [cron-job.org](https://cron-job.org) (Free, no signup required)
- [EasyCron](https://www.easycron.com) (Free tier available)
- [UptimeRobot](https://uptimerobot.com) (Monitoring with intervals)

**Setup**:
1. Create a secure cron endpoint with API key authentication
2. Configure the service to call your endpoint every 5 minutes
3. Add API key validation to your scheduler endpoint

### Option 3: Cloudflare Workers Cron Triggers

Create a separate Cloudflare Worker with cron triggers:

**Steps**:
1. Create a new Worker with cron triggers in Cloudflare Dashboard
2. Configure it to run every 5 minutes
3. Have it call your `/api/dex/collect-bulk` endpoint

## Recommended Implementation: Supabase Edge Function

Here's the complete implementation:

### 1. Create Supabase Edge Function

Create file in your Supabase project: `supabase/functions/collect-dex/index.ts`

```typescript
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

serve(async (req) => {
  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const siteUrl = Deno.env.get('SITE_URL') || 'https://your-pages-url.pages.dev'

    // Create Supabase client with service role (bypasses RLS)
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    console.log('🕐 Cron: Starting DEX collection for all companies...')

    // Get all companies with active machines
    const { data: companies, error: companiesError } = await supabase
      .from('companies')
      .select(`
        id,
        company_name,
        machines!inner (
          id,
          case_serial,
          status
        )
      `)
      .eq('machines.status', 'active')

    if (companiesError) {
      throw new Error(`Failed to fetch companies: ${companiesError.message}`)
    }

    console.log(`Found ${companies?.length || 0} companies with active machines`)

    const results = []

    // Process each company
    for (const company of companies || []) {
      try {
        // Get user credentials for this company
        const { data: credentials } = await supabase
          .from('user_credentials')
          .select('dex_username, dex_password, dex_site_url')
          .eq('company_id', company.id)
          .limit(1)
          .single()

        if (!credentials?.dex_username) {
          console.log(`Skipping company ${company.company_name} - no DEX credentials configured`)
          continue
        }

        console.log(`Collecting DEX data for company: ${company.company_name}`)

        // Call the bulk collection endpoint
        const response = await fetch(`${siteUrl}/api/dex/collect-bulk`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Company-ID': company.id, // Pass company ID for service-level auth
            'X-Service-Key': Deno.env.get('SERVICE_API_KEY')! // Secret key for service auth
          }
        })

        const result = await response.json()

        results.push({
          company: company.company_name,
          success: result.success,
          recordsCollected: result.recordsCount || 0,
          machinesUpdated: result.machinesUpdated || 0
        })

      } catch (error) {
        console.error(`Error collecting for company ${company.company_name}:`, error)
        results.push({
          company: company.company_name,
          success: false,
          error: error.message
        })
      }
    }

    const successCount = results.filter(r => r.success).length
    const totalRecords = results.reduce((sum, r) => sum + (r.recordsCollected || 0), 0)

    console.log(`✅ Cron completed: ${successCount}/${results.length} companies processed, ${totalRecords} records collected`)

    return new Response(
      JSON.stringify({
        success: true,
        companiesProcessed: results.length,
        successfulCollections: successCount,
        totalRecords,
        results
      }),
      { headers: { 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('❌ Cron error:', error)
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
})
```

### 2. Deploy Edge Function

```bash
# Install Supabase CLI if not already installed
npm install -g supabase

# Login to Supabase
supabase login

# Link to your project
supabase link --project-ref your-project-ref

# Deploy the function
supabase functions deploy collect-dex

# Set environment variables
supabase secrets set SITE_URL=https://your-pages-url.pages.dev
supabase secrets set SERVICE_API_KEY=your-random-secret-key
```

### 3. Schedule with pg_cron

Run this in Supabase SQL Editor:

```sql
-- Enable pg_cron extension
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Enable HTTP extension for making requests
CREATE EXTENSION IF NOT EXISTS http;

-- Schedule DEX collection every 5 minutes
SELECT cron.schedule(
  'dex-collection-every-5-minutes',
  '*/5 * * * *',  -- Every 5 minutes
  $$
  SELECT
    net.http_post(
      url:='https://your-project-ref.supabase.co/functions/v1/collect-dex',
      headers:='{"Content-Type": "application/json", "Authorization": "Bearer YOUR_ANON_KEY"}'::jsonb
    ) AS request_id;
  $$
);

-- View scheduled jobs
SELECT * FROM cron.job;

-- View job run history
SELECT * FROM cron.job_run_details ORDER BY start_time DESC LIMIT 10;

-- Unschedule a job (if needed)
-- SELECT cron.unschedule('dex-collection-every-5-minutes');
```

### 4. Update collect-bulk API to Support Service Auth

Modify `/pages/api/dex/collect-bulk.js` to accept service-level authentication:

```javascript
// At the top of the handler
const serviceKey = req.headers.get('X-Service-Key')
const companyIdHeader = req.headers.get('X-Company-ID')

// If service key is provided, use service-level auth
if (serviceKey && serviceKey === process.env.SERVICE_API_KEY) {
  // Service-level authentication
  if (!companyIdHeader) {
    return new Response(JSON.stringify({ error: 'X-Company-ID header required for service auth' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    })
  }

  companyId = companyIdHeader
  // Use service role client
  supabase = createServiceClient()
} else {
  // Regular user authentication (existing code)
  const { user, companyId: userCompanyId, error: authError } = await getUserCompanyContext(req)
  // ... existing auth code
}
```

## Monitoring

### Check Cron Job Status

```sql
-- View all scheduled jobs
SELECT * FROM cron.job;

-- View recent job runs
SELECT
  job_id,
  start_time,
  end_time,
  status,
  return_message
FROM cron.job_run_details
WHERE jobid = (SELECT jobid FROM cron.job WHERE jobname = 'dex-collection-every-5-minutes')
ORDER BY start_time DESC
LIMIT 20;
```

### View Collection Logs in Supabase

Go to Supabase Dashboard → Edge Functions → Logs to see execution logs.

## Troubleshooting

### Cron not running?

1. Verify pg_cron is enabled: `SELECT * FROM pg_extension WHERE extname = 'pg_cron';`
2. Check job is scheduled: `SELECT * FROM cron.job;`
3. View errors: `SELECT * FROM cron.job_run_details WHERE status = 'failed';`

### Edge Function errors?

1. Check logs in Supabase Dashboard → Edge Functions
2. Verify environment variables are set: `supabase secrets list`
3. Test manually: `curl -X POST https://your-project.supabase.co/functions/v1/collect-dex`

### No data being collected?

1. Verify companies have DEX credentials in `user_credentials` table
2. Check that machines are marked as `status = 'active'`
3. Review Edge Function logs for specific errors

## Cost Considerations

- **Supabase Free Tier**: 500K Edge Function invocations/month (more than enough for 5-min intervals)
- **pg_cron**: Free, included with Supabase PostgreSQL
- Running every 5 minutes = 8,640 invocations/month

## Alternative: Simpler Setup with GitHub Actions

If you prefer not to use Supabase Edge Functions, you can use GitHub Actions:

```yaml
# .github/workflows/dex-collection.yml
name: DEX Data Collection
on:
  schedule:
    - cron: '*/5 * * * *'  # Every 5 minutes
  workflow_dispatch:  # Allow manual trigger

jobs:
  collect:
    runs-on: ubuntu-latest
    steps:
      - name: Trigger DEX Collection
        run: |
          curl -X POST https://your-pages-url.pages.dev/api/dex/scheduler \
            -H "Authorization: Bearer ${{ secrets.SERVICE_API_KEY }}" \
            -H "Content-Type: application/json"
```

This is simpler but GitHub Actions has a 5-minute minimum interval.

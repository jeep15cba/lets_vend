-- Setup pg_cron for automated DEX collection
-- This migration sets up a cron job to call the collect-dex-standalone Edge Function
-- Runs at :00, :20, and :40 minutes past each hour (3 times per hour)

-- Enable pg_cron extension (may already be enabled by Supabase)
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Enable pg_net extension for HTTP requests
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Grant necessary permissions
GRANT USAGE ON SCHEMA cron TO postgres;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA cron TO postgres;

-- Create a function to call the Edge Function
-- Note: You'll need to update the URL and anon key after running this migration
CREATE OR REPLACE FUNCTION public.trigger_dex_collection()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_request_id bigint;
  v_function_url text;
  v_anon_key text;
BEGIN
  -- Replace these with your actual Supabase project values
  -- Format: https://YOUR_PROJECT_ID.supabase.co/functions/v1/collect-dex-standalone
  v_function_url := 'https://hkapfjibtaqmdpgxseuj.supabase.co/functions/v1/collect-dex-standalone';
  v_anon_key := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';

  -- Make async HTTP POST request to Edge Function
  SELECT INTO v_request_id net.http_post(
    url := v_function_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_anon_key
    ),
    body := '{}'::jsonb
  );

  -- Log the request
  RAISE NOTICE 'DEX collection triggered: request_id=%', v_request_id;

EXCEPTION
  WHEN OTHERS THEN
    -- Log errors but don't fail the cron job
    RAISE WARNING 'DEX collection trigger failed: %', SQLERRM;
END;
$$;

-- Remove existing job if it exists
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'collect-dex-automated') THEN
    PERFORM cron.unschedule('collect-dex-automated');
  END IF;
END
$$;

-- Schedule the cron job to run at :00, :20, and :40 past each hour
SELECT cron.schedule(
  'collect-dex-automated',              -- job name
  '0,20,40 * * * *',                    -- cron schedule: at 0, 20, and 40 minutes past each hour
  $$SELECT public.trigger_dex_collection();$$
);

-- Alternative schedules (uncomment to change frequency):
-- Every 15 minutes:  SELECT cron.schedule('collect-dex-automated', '*/15 * * * *', $$SELECT public.trigger_dex_collection();$$);
-- Every 20 minutes:  SELECT cron.schedule('collect-dex-automated', '*/20 * * * *', $$SELECT public.trigger_dex_collection();$$);
-- Every 30 minutes:  SELECT cron.schedule('collect-dex-automated', '*/30 * * * *', $$SELECT public.trigger_dex_collection();$$);
-- Every hour:        SELECT cron.schedule('collect-dex-automated', '0 * * * *', $$SELECT public.trigger_dex_collection();$$);

-- Verify the job was created successfully
SELECT
  jobid,
  jobname,
  schedule,
  command,
  nodename,
  nodeport,
  database,
  username,
  active,
  jobid
FROM cron.job
WHERE jobname = 'collect-dex-automated';

-- Add helpful comments
COMMENT ON FUNCTION public.trigger_dex_collection() IS
'Calls the collect-dex-standalone Supabase Edge Function for automated DEX collection.
Scheduled to run at :00, :20, and :40 minutes past each hour (3x per hour) via pg_cron.
Function handles: authentication, data fetching, parsing, and database updates.';

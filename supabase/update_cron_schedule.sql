-- Update the cron schedule to run at :00, :20, and :40 past each hour
-- Run this in Supabase SQL Editor to update the existing job

-- Remove old schedule
SELECT cron.unschedule('collect-dex-automated');

-- Add new schedule
SELECT cron.schedule(
  'collect-dex-automated',
  '0,20,40 * * * *',
  $$SELECT public.trigger_dex_collection();$$
);

-- Verify the updated schedule
SELECT
  jobid,
  jobname,
  schedule,
  active
FROM cron.job
WHERE jobname = 'collect-dex-automated';

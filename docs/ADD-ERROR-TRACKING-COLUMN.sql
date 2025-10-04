-- Add error tracking columns to machines table
-- This will store EA1 error events with their timestamps and action status

ALTER TABLE machines
ADD COLUMN IF NOT EXISTS latest_errors JSONB DEFAULT '[]'::jsonb;

-- Add comment to document the column structure
COMMENT ON COLUMN machines.latest_errors IS 'Stores array of EA1 error events with structure: [{code: "EGS", date: "250930", time: "1237", timestamp: "2025-09-30T12:37:00Z", actioned: false, actioned_at: null}]';

-- Index for querying unactioned errors
CREATE INDEX IF NOT EXISTS idx_machines_latest_errors ON machines USING GIN (latest_errors);

-- If you see errors like "Could not find the table 'public.devices' in the schema cache"
-- Run this command to reload the PostgREST schema cache in Supabase:

NOTIFY pgrst, 'reload schema';

-- Alternative: In Supabase Dashboard, go to Settings > API > Schema Cache > Reload Schema

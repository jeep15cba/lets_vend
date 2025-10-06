-- Add display_order column to machines table for custom sorting
ALTER TABLE machines
ADD COLUMN display_order INTEGER;

-- Set initial display_order based on case_serial alphabetical order
-- This gives each machine a unique order value starting from 1
WITH ordered_machines AS (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY company_id ORDER BY case_serial) as row_num
  FROM machines
)
UPDATE machines
SET display_order = ordered_machines.row_num
FROM ordered_machines
WHERE machines.id = ordered_machines.id;

-- Create index for better query performance when sorting by display_order
CREATE INDEX idx_machines_display_order ON machines(company_id, display_order);

-- Add comment for documentation
COMMENT ON COLUMN machines.display_order IS 'User-defined display order for sorting machines in the UI. Lower numbers appear first.';

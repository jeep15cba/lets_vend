-- Fix machine_type constraint to allow updating 'snack' values
-- and update all existing 'snack' values to 'food'

-- Step 1: Drop the existing constraint
ALTER TABLE machines DROP CONSTRAINT IF EXISTS machines_machine_type_check;

-- Step 2: Update all 'snack' values to 'food'
UPDATE machines SET machine_type = 'food' WHERE machine_type = 'snack';

-- Step 3: Recreate the constraint with the correct valid values
ALTER TABLE machines ADD CONSTRAINT machines_machine_type_check
CHECK (machine_type IN ('unknown', 'beverage', 'food'));

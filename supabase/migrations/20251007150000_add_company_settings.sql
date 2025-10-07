-- Add settings column to companies table for storing configuration
ALTER TABLE companies ADD COLUMN IF NOT EXISTS settings JSONB DEFAULT '{"machineTypes": ["unknown", "beverage", "food"]}'::jsonb;

-- Create index for faster JSONB queries
CREATE INDEX IF NOT EXISTS companies_settings_idx ON companies USING gin (settings);

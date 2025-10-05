-- Subscription Management Schema
-- This schema adds subscription tiers and billing management to the VendTrack platform

-- ============================================================================
-- 1. CREATE SUBSCRIPTION TIERS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS subscription_tiers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(100) NOT NULL UNIQUE,
  description TEXT,
  machine_limit INTEGER NOT NULL, -- Maximum number of machines allowed
  price_monthly DECIMAL(10, 2) NOT NULL DEFAULT 0.00, -- Monthly price in AUD
  price_yearly DECIMAL(10, 2) NOT NULL DEFAULT 0.00, -- Yearly price in AUD
  features JSONB DEFAULT '[]'::jsonb, -- Array of feature descriptions
  is_active BOOLEAN DEFAULT true,
  display_order INTEGER DEFAULT 0, -- For ordering tiers in UI
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert default subscription tiers
INSERT INTO subscription_tiers (name, description, machine_limit, price_monthly, price_yearly, features, display_order) VALUES
  ('Free Trial', 'Try VendTrack with up to 3 machines', 3, 0.00, 0.00,
   '["Up to 3 machines", "Basic DEX data collection", "Standard support", "7-day data retention"]'::jsonb, 1),

  ('Starter', 'Perfect for small operators', 10, 49.00, 490.00,
   '["Up to 10 machines", "Full DEX data collection", "Email support", "30-day data retention", "Basic reporting"]'::jsonb, 2),

  ('Professional', 'For growing vending businesses', 50, 149.00, 1490.00,
   '["Up to 50 machines", "Full DEX data collection", "Priority support", "90-day data retention", "Advanced reporting", "Custom alerts"]'::jsonb, 3),

  ('Enterprise', 'Unlimited machines for large operators', 999999, 399.00, 3990.00,
   '["Unlimited machines", "Full DEX data collection", "24/7 support", "Unlimited data retention", "Advanced reporting", "Custom alerts", "API access", "White-label options"]'::jsonb, 4),

  ('Promotional', 'Special promotional tier', 999999, 0.00, 0.00,
   '["Custom machine limit", "All features included", "Promotional pricing"]'::jsonb, 0)
ON CONFLICT (name) DO NOTHING;

-- ============================================================================
-- 2. ADD SUBSCRIPTION FIELDS TO COMPANIES TABLE
-- ============================================================================

-- Add subscription-related columns to companies table
ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS subscription_tier_id UUID REFERENCES subscription_tiers(id),
  ADD COLUMN IF NOT EXISTS subscription_status VARCHAR(50) DEFAULT 'trial'
    CHECK (subscription_status IN ('trial', 'active', 'past_due', 'canceled', 'suspended', 'promotional')),
  ADD COLUMN IF NOT EXISTS subscription_start_date TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS subscription_end_date TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS billing_cycle VARCHAR(20) DEFAULT 'monthly'
    CHECK (billing_cycle IN ('monthly', 'yearly')),
  ADD COLUMN IF NOT EXISTS machine_count INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS is_promotional BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS promotional_notes TEXT,
  ADD COLUMN IF NOT EXISTS last_billing_date TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS next_billing_date TIMESTAMPTZ;

-- Set default tier for existing companies (Free Trial)
UPDATE companies
SET subscription_tier_id = (SELECT id FROM subscription_tiers WHERE name = 'Free Trial' LIMIT 1),
    subscription_status = 'trial',
    subscription_start_date = NOW()
WHERE subscription_tier_id IS NULL;

-- ============================================================================
-- 3. CREATE SUBSCRIPTION HISTORY TABLE (for audit trail)
-- ============================================================================

CREATE TABLE IF NOT EXISTS subscription_history (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  tier_id UUID REFERENCES subscription_tiers(id),
  previous_tier_id UUID REFERENCES subscription_tiers(id),
  status VARCHAR(50) NOT NULL,
  previous_status VARCHAR(50),
  changed_by UUID,  -- References auth.users but without FK constraint
  change_reason TEXT,
  billing_cycle VARCHAR(20),
  is_promotional BOOLEAN DEFAULT false,
  promotional_notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- 4. CREATE FUNCTION TO UPDATE MACHINE COUNT
-- ============================================================================

CREATE OR REPLACE FUNCTION update_company_machine_count()
RETURNS TRIGGER AS $$
BEGIN
  -- Update the machine count for the company
  UPDATE companies
  SET machine_count = (
    SELECT COUNT(*)
    FROM machines
    WHERE company_id = COALESCE(NEW.company_id, OLD.company_id)
  )
  WHERE id = COALESCE(NEW.company_id, OLD.company_id);

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 5. CREATE TRIGGER FOR MACHINE COUNT
-- ============================================================================

DROP TRIGGER IF EXISTS update_machine_count_trigger ON machines;

CREATE TRIGGER update_machine_count_trigger
AFTER INSERT OR DELETE ON machines
FOR EACH ROW
EXECUTE FUNCTION update_company_machine_count();

-- ============================================================================
-- 6. CREATE FUNCTION TO CHECK SUBSCRIPTION LIMITS
-- ============================================================================

CREATE OR REPLACE FUNCTION check_machine_limit()
RETURNS TRIGGER AS $$
DECLARE
  current_count INTEGER;
  tier_limit INTEGER;
  is_promo BOOLEAN;
BEGIN
  -- Get current machine count and tier limit
  SELECT
    COALESCE(c.machine_count, 0),
    COALESCE(st.machine_limit, 3),
    COALESCE(c.is_promotional, false)
  INTO current_count, tier_limit, is_promo
  FROM companies c
  LEFT JOIN subscription_tiers st ON c.subscription_tier_id = st.id
  WHERE c.id = NEW.company_id;

  -- Allow if promotional account (override limits)
  IF is_promo THEN
    RETURN NEW;
  END IF;

  -- Check if adding this machine would exceed the limit
  IF current_count >= tier_limit THEN
    RAISE EXCEPTION 'Machine limit exceeded. Current limit: %. Please upgrade your subscription.', tier_limit;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 7. CREATE TRIGGER FOR MACHINE LIMIT CHECK
-- ============================================================================

DROP TRIGGER IF EXISTS check_machine_limit_trigger ON machines;

CREATE TRIGGER check_machine_limit_trigger
BEFORE INSERT ON machines
FOR EACH ROW
EXECUTE FUNCTION check_machine_limit();

-- ============================================================================
-- 8. CREATE RLS POLICIES
-- ============================================================================

-- Enable RLS on subscription_tiers (public read, admin write)
ALTER TABLE subscription_tiers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view subscription tiers"
  ON subscription_tiers FOR SELECT
  TO authenticated
  USING (true);

-- Note: For now, subscription tiers can only be modified via SQL or by service role
-- Add proper admin role checking when admin functionality is implemented
CREATE POLICY "Prevent tier modifications by regular users"
  ON subscription_tiers FOR ALL
  TO authenticated
  USING (false);

-- Enable RLS on subscription_history
ALTER TABLE subscription_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their company subscription history"
  ON subscription_history FOR SELECT
  TO authenticated
  USING (
    company_id = (auth.jwt() -> 'user_metadata' ->> 'company_id')::uuid
  );

CREATE POLICY "Admins can manage subscription history"
  ON subscription_history FOR ALL
  TO authenticated
  USING (
    company_id = (auth.jwt() -> 'user_metadata' ->> 'company_id')::uuid
  );

-- ============================================================================
-- 9. CREATE INDEXES FOR PERFORMANCE
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_companies_subscription_tier
  ON companies(subscription_tier_id);

CREATE INDEX IF NOT EXISTS idx_companies_subscription_status
  ON companies(subscription_status);

CREATE INDEX IF NOT EXISTS idx_subscription_history_company
  ON subscription_history(company_id);

CREATE INDEX IF NOT EXISTS idx_subscription_history_created
  ON subscription_history(created_at DESC);

-- ============================================================================
-- 10. CREATE VIEW FOR SUBSCRIPTION OVERVIEW
-- ============================================================================

CREATE OR REPLACE VIEW company_subscription_overview AS
SELECT
  c.id as company_id,
  c.company_name,
  c.machine_count,
  c.subscription_status,
  c.subscription_start_date,
  c.subscription_end_date,
  c.billing_cycle,
  c.is_promotional,
  c.promotional_notes,
  c.next_billing_date,
  st.name as tier_name,
  st.description as tier_description,
  st.machine_limit,
  st.price_monthly,
  st.price_yearly,
  st.features as tier_features,
  CASE
    WHEN c.is_promotional THEN true
    WHEN c.machine_count >= st.machine_limit THEN true
    ELSE false
  END as is_at_limit,
  CASE
    WHEN c.is_promotional THEN 0.00
    WHEN c.billing_cycle = 'yearly' THEN st.price_yearly
    ELSE st.price_monthly
  END as current_price
FROM companies c
LEFT JOIN subscription_tiers st ON c.subscription_tier_id = st.id;

-- Grant access to the view
GRANT SELECT ON company_subscription_overview TO authenticated;

-- ============================================================================
-- NOTES:
-- ============================================================================
-- After running this schema:
-- 1. All existing companies will be set to 'Free Trial' tier
-- 2. Machine count will be automatically tracked
-- 3. Adding machines will be blocked if limit is exceeded (unless promotional)
-- 4. Promotional accounts bypass all limits
-- 5. Subscription history is tracked for audit purposes

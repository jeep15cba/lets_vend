# Subscription Management System

This document explains how to set up and use the subscription management system in VendTrack.

## Overview

The subscription system provides:
- **Tiered pricing** based on machine count
- **Automatic machine limit** enforcement
- **Promotional accounts** with unlimited machines
- **Subscription history** tracking
- **Flexible billing** (monthly/yearly)

## Quick Start

### 1. Run the Database Migration

Execute the SQL schema in your Supabase SQL Editor:

```bash
# Copy the contents of docs/SUBSCRIPTION-SCHEMA.sql
# Paste into Supabase SQL Editor
# Execute the script
```

This will:
- Create `subscription_tiers` table with default tiers
- Add subscription fields to `companies` table
- Create `subscription_history` table for audit trail
- Set up triggers for automatic machine counting
- Create RLS policies for security
- Set all existing companies to "Free Trial" tier

### 2. Verify the Setup

Check that the tiers were created:

```sql
SELECT * FROM subscription_tiers ORDER BY display_order;
```

You should see:
- Free Trial (0-3 machines, $0/month)
- Starter (up to 10 machines, $49/month)
- Professional (up to 50 machines, $149/month)
- Enterprise (unlimited, $399/month)
- Promotional (unlimited, $0/month)

## Subscription Tiers

### Free Trial
- **Machine Limit**: 3
- **Price**: $0/month
- **Features**: Basic DEX collection, 7-day retention
- **Use Case**: New users trying out the platform

### Starter
- **Machine Limit**: 10
- **Price**: $49/month or $490/year
- **Features**: Full DEX collection, 30-day retention, basic reporting
- **Use Case**: Small operators

### Professional
- **Machine Limit**: 50
- **Price**: $149/month or $1,490/year
- **Features**: Advanced reporting, custom alerts, 90-day retention
- **Use Case**: Growing vending businesses

### Enterprise
- **Machine Limit**: Unlimited
- **Price**: $399/month or $3,990/year
- **Features**: All features, API access, white-label options
- **Use Case**: Large operators

### Promotional
- **Machine Limit**: Unlimited
- **Price**: $0 (free)
- **Features**: All features included
- **Use Case**: Special promotional users, partners, beta testers

## API Endpoints

### Get Current Subscription

```javascript
GET /api/subscription

Response:
{
  "success": true,
  "subscription": {
    "company_id": "...",
    "company_name": "My Company",
    "machine_count": 5,
    "subscription_status": "active",
    "tier_name": "Professional",
    "machine_limit": 50,
    "current_price": 149.00,
    "is_at_limit": false,
    "is_promotional": false,
    ...
  }
}
```

### Get Available Tiers

```javascript
GET /api/subscription/tiers

Response:
{
  "success": true,
  "tiers": [
    {
      "id": "...",
      "name": "Starter",
      "description": "Perfect for small operators",
      "machine_limit": 10,
      "price_monthly": 49.00,
      "price_yearly": 490.00,
      "features": [...],
      ...
    },
    ...
  ]
}
```

### Update Subscription (Admin Only)

```javascript
PUT /api/subscription
Content-Type: application/json

{
  "tier_id": "tier-uuid",
  "subscription_status": "active",
  "billing_cycle": "yearly",
  "is_promotional": false
}

Response:
{
  "success": true,
  "subscription": { ... }
}
```

## How Machine Limits Work

### Automatic Counting

Machine count is automatically tracked:
- When a machine is added → count increases
- When a machine is deleted → count decreases
- Triggered by database events (no manual updates needed)

### Limit Enforcement

When adding a new machine:

**Normal Account**:
```
Current machines: 9
Tier limit: 10
Action: Add machine → ✅ Success (10/10)

Current machines: 10
Tier limit: 10
Action: Add machine → ❌ Error: "Machine limit exceeded"
```

**Promotional Account**:
```
Current machines: 999
Tier limit: 10 (ignored)
is_promotional: true
Action: Add machine → ✅ Success (bypasses all limits)
```

### Setting Up a Promotional Account

To give a user unlimited machines for free:

```sql
-- Option 1: Use the Promotional tier
UPDATE companies
SET
  subscription_tier_id = (SELECT id FROM subscription_tiers WHERE name = 'Promotional'),
  subscription_status = 'promotional',
  is_promotional = true,
  promotional_notes = 'Beta tester - free unlimited access until 2025-12-31'
WHERE id = 'company-uuid';

-- Option 2: Keep their current tier but make it promotional
UPDATE companies
SET
  is_promotional = true,
  promotional_notes = 'Partner account - free Professional tier'
WHERE id = 'company-uuid';
```

## Subscription Statuses

- **trial**: Free trial period (default for new companies)
- **active**: Paid subscription, in good standing
- **past_due**: Payment failed, grace period
- **canceled**: User canceled, account still accessible until end of period
- **suspended**: Account suspended (no access)
- **promotional**: Special promotional status

## Billing Cycles

- **monthly**: Charged every month
- **yearly**: Charged annually (typically 2 months free vs monthly)

## Subscription History

All changes are tracked in `subscription_history`:

```sql
SELECT
  sh.created_at,
  st1.name as previous_tier,
  st2.name as new_tier,
  sh.previous_status,
  sh.status,
  sh.change_reason,
  u.email as changed_by_user
FROM subscription_history sh
LEFT JOIN subscription_tiers st1 ON sh.previous_tier_id = st1.id
LEFT JOIN subscription_tiers st2 ON sh.tier_id = st2.id
LEFT JOIN auth.users u ON sh.changed_by = u.id
WHERE sh.company_id = 'company-uuid'
ORDER BY sh.created_at DESC;
```

## Examples

### Check if Company is at Limit

```javascript
const { data } = await supabase
  .from('company_subscription_overview')
  .select('machine_count, machine_limit, is_at_limit, is_promotional')
  .eq('company_id', companyId)
  .single();

if (!data.is_promotional && data.is_at_limit) {
  alert('You have reached your machine limit. Please upgrade.');
}
```

### Upgrade a Company

```javascript
// Get the Professional tier
const { data: tier } = await supabase
  .from('subscription_tiers')
  .select('id')
  .eq('name', 'Professional')
  .single();

// Update company subscription
await fetch('/api/subscription', {
  method: 'PUT',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    tier_id: tier.id,
    subscription_status: 'active',
    billing_cycle: 'yearly'
  })
});
```

### Grant Promotional Access

```javascript
// Make a company promotional (admin only)
await fetch('/api/subscription', {
  method: 'PUT',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    is_promotional: true,
    promotional_notes: 'VIP customer - unlimited free access',
    subscription_status: 'promotional'
  })
});
```

## Migration Notes

After running the schema:

1. **All existing companies** are automatically set to "Free Trial"
2. **Machine counts** are calculated from existing machines
3. **No data is lost** - only new fields are added
4. **Users can continue** using the app normally
5. **Limits are enforced** on next machine addition

## Testing

To test the subscription system:

```sql
-- 1. Create a test company on Starter tier (limit: 10)
UPDATE companies
SET subscription_tier_id = (SELECT id FROM subscription_tiers WHERE name = 'Starter')
WHERE id = 'test-company-id';

-- 2. Check current count
SELECT machine_count, (SELECT machine_limit FROM subscription_tiers WHERE id = subscription_tier_id)
FROM companies WHERE id = 'test-company-id';

-- 3. Try to add machine when at limit (should fail)
-- Add machines via UI or API until count = 10
-- Then try to add one more → should get error

-- 4. Make promotional (should bypass limit)
UPDATE companies SET is_promotional = true WHERE id = 'test-company-id';
-- Now adding machines should work regardless of limit
```

## Troubleshooting

### Machine count is wrong
```sql
-- Manually recalculate
UPDATE companies
SET machine_count = (
  SELECT COUNT(*) FROM machines WHERE company_id = companies.id
);
```

### Can't add machines (promotional account)
```sql
-- Verify promotional status
SELECT is_promotional, subscription_status FROM companies WHERE id = 'company-id';

-- If not set, enable it
UPDATE companies SET is_promotional = true WHERE id = 'company-id';
```

### Need to change tier limits
```sql
-- Update a tier's machine limit
UPDATE subscription_tiers
SET machine_limit = 25
WHERE name = 'Starter';
```

## Security

- ✅ RLS enabled on all subscription tables
- ✅ Users can only view their own subscription
- ✅ Only admins can modify subscriptions
- ✅ Subscription history tracks all changes
- ✅ Machine limits enforced at database level

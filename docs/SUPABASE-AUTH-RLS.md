# Supabase Authentication & Row Level Security

This document covers the complete authentication and Row Level Security (RLS) implementation for the vending machine management system.

## Overview

The system implements multi-tenant authentication with company-based access control:

- **Companies** can only see their own machines and data
- **Admin users** have system-wide access
- **Regular users** have access only to their company's data
- **Row Level Security** enforces data isolation at the database level

## Authentication Flow

### 1. User Registration
```javascript
// Include company metadata during signup
const { user, error } = await auth.signUp(email, password, {
  company_id: 'company-uuid',
  role: 'user', // or 'admin'
  name: 'User Name'
})
```

### 2. Authentication Context
The `AuthContext` provides:
- `user` - Current authenticated user
- `companyId` - User's company ID for RLS
- `role` - User's role (admin/user)
- `isAuthenticated` - Boolean auth status
- `hasCompanyAccess` - Boolean company access
- `isAdmin` - Boolean admin status

### 3. Middleware Protection
Routes are protected via Next.js middleware:
- `/dashboard/*` - Requires authentication
- `/admin/*` - Requires admin role
- `/api/*` - Most endpoints require auth (configurable)

## Row Level Security Policies

### Core RLS Implementation

```sql
-- Enable RLS on all tables
ALTER TABLE companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE machines ENABLE ROW LEVEL SECURITY;
ALTER TABLE locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE dex_captures ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE cash_audits ENABLE ROW LEVEL SECURITY;
ALTER TABLE machine_errors ENABLE ROW LEVEL SECURITY;
ALTER TABLE temperature_readings ENABLE ROW LEVEL SECURITY;

-- Companies policy: Users can only see their own company
CREATE POLICY "company_access" ON companies
  FOR ALL USING (
    auth.jwt() ->> 'role' = 'admin' OR
    id = (auth.jwt() ->> 'company_id')::UUID
  );

-- Machines policy: Users can only see machines from their company
CREATE POLICY "machine_company_access" ON machines
  FOR ALL USING (
    auth.jwt() ->> 'role' = 'admin' OR
    company_id = (auth.jwt() ->> 'company_id')::UUID
  );

-- Locations policy: Users can only see locations from their company
CREATE POLICY "location_company_access" ON locations
  FOR ALL USING (
    auth.jwt() ->> 'role' = 'admin' OR
    company_id = (auth.jwt() ->> 'company_id')::UUID
  );

-- DEX captures policy: Users can only see data from their company's machines
CREATE POLICY "dex_company_access" ON dex_captures
  FOR ALL USING (
    auth.jwt() ->> 'role' = 'admin' OR
    machine_id IN (
      SELECT id FROM machines
      WHERE company_id = (auth.jwt() ->> 'company_id')::UUID
    )
  );

-- Sales transactions policy
CREATE POLICY "sales_company_access" ON sales_transactions
  FOR ALL USING (
    auth.jwt() ->> 'role' = 'admin' OR
    machine_id IN (
      SELECT id FROM machines
      WHERE company_id = (auth.jwt() ->> 'company_id')::UUID
    )
  );

-- Cash audits policy
CREATE POLICY "cash_company_access" ON cash_audits
  FOR ALL USING (
    auth.jwt() ->> 'role' = 'admin' OR
    machine_id IN (
      SELECT id FROM machines
      WHERE company_id = (auth.jwt() ->> 'company_id')::UUID
    )
  );

-- Machine errors policy
CREATE POLICY "errors_company_access" ON machine_errors
  FOR ALL USING (
    auth.jwt() ->> 'role' = 'admin' OR
    machine_id IN (
      SELECT id FROM machines
      WHERE company_id = (auth.jwt() ->> 'company_id')::UUID
    )
  );

-- Temperature readings policy
CREATE POLICY "temperature_company_access" ON temperature_readings
  FOR ALL USING (
    auth.jwt() ->> 'role' = 'admin' OR
    machine_id IN (
      SELECT id FROM machines
      WHERE company_id = (auth.jwt() ->> 'company_id')::UUID
    )
  );
```

## JWT Token Structure

Users' JWT tokens contain company information for RLS:

```json
{
  "aud": "authenticated",
  "exp": 1234567890,
  "sub": "user-uuid",
  "email": "user@company.com",
  "role": "authenticated",
  "company_id": "company-uuid",
  "user_role": "admin",
  "app_metadata": {
    "provider": "email",
    "providers": ["email"]
  },
  "user_metadata": {
    "company_id": "company-uuid",
    "role": "admin",
    "name": "User Name"
  }
}
```

## API Authentication

### Middleware Headers
Authenticated API requests include headers:
- `x-user-id` - User ID
- `x-user-email` - User email
- `x-company-id` - Company ID for filtering
- `x-user-role` - User role (admin/user)

### API Implementation Example
```javascript
export default async function handler(req, res) {
  // Extract auth context from middleware
  const userId = req.headers['x-user-id'];
  const companyId = req.headers['x-company-id'];
  const userRole = req.headers['x-user-role'];

  // Apply company filtering for non-admin users
  let query = supabase.from('machines').select('*');

  if (userRole !== 'admin' && companyId) {
    query = query.eq('company_id', companyId);
  }

  const { data, error } = await query;

  return res.json({ data, error });
}
```

## User Roles & Permissions

### Admin Role
- Full system access
- Can see all companies and machines
- Can manage users and companies
- Bypasses all RLS policies

### User Role
- Company-scoped access only
- Can see only their company's data
- Cannot access admin functions
- Subject to all RLS policies

## Security Features

### 1. Multi-Tenant Isolation
- Complete data separation between companies
- Database-level enforcement via RLS
- No application-level trust required

### 2. Automatic Filtering
- All queries automatically filtered by company
- Impossible to access other company's data
- Even with SQL injection, RLS provides protection

### 3. JWT Validation
- Tokens contain company context
- Cryptographically signed by Supabase
- Cannot be tampered with

### 4. Middleware Protection
- Route-level authentication
- Role-based access control
- Automatic redirects for unauthorized access

## Development Mode

For development without Supabase configured:
- Fake authentication with admin role
- All security checks bypassed
- Dev mode clearly logged
- Easy transition to production auth

```javascript
// Dev mode detection
const isDevMode = !process.env.NEXT_PUBLIC_SUPABASE_URL;
if (isDevMode) {
  console.log('🔧 DEV MODE: Using fake authentication');
  // Bypass auth checks
}
```

## Implementation Checklist

- ✅ **Supabase client configuration**
- ✅ **Authentication context with company support**
- ✅ **Middleware for route protection**
- ✅ **API authentication headers**
- ✅ **RLS policies for all tables**
- ✅ **Dev mode fallback**
- ⭕ **User management UI**
- ⭕ **Company onboarding flow**
- ⭕ **Password reset functionality**
- ⭕ **Role management interface**

## Testing Authentication

### 1. Test User Creation
```sql
-- Create test company
INSERT INTO companies (id, company_name, company_code)
VALUES ('test-company-1', 'Test Company', 'TEST001');

-- Create test user with company context
-- This would be done via Supabase Auth UI or API
```

### 2. Test RLS Policies
```sql
-- Test as regular user (should only see own company)
SET request.jwt.claims = '{"role": "authenticated", "company_id": "test-company-1", "user_role": "user"}';
SELECT * FROM machines; -- Should only return company's machines

-- Test as admin (should see all)
SET request.jwt.claims = '{"role": "authenticated", "user_role": "admin"}';
SELECT * FROM machines; -- Should return all machines
```

### 3. API Testing
```bash
# Test protected endpoint
curl -H "Authorization: Bearer jwt_token" http://localhost:3300/api/machines/summary

# Test without auth (should fail)
curl http://localhost:3300/api/protected-endpoint
```

## Security Best Practices

1. **Never trust client-side filtering** - Always rely on RLS
2. **Validate JWT claims** in sensitive operations
3. **Log authentication events** for audit trails
4. **Use HTTPS in production** to protect tokens
5. **Implement proper session management**
6. **Regular security audits** of RLS policies
7. **Monitor for unauthorized access attempts**

## Troubleshooting

### Common Issues

1. **RLS blocking legitimate access**
   - Check JWT token contains correct company_id
   - Verify RLS policies are correctly written
   - Test with admin role to bypass RLS

2. **Authentication not working**
   - Verify Supabase environment variables
   - Check middleware configuration
   - Ensure JWT token is valid

3. **Users seeing wrong data**
   - Verify company_id in user metadata
   - Check RLS policies are enabled
   - Test data isolation with test accounts
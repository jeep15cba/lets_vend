# Re-encrypt User Credentials

When you change the `ENCRYPTION_KEY`, existing encrypted credentials in the database become unreadable. You need to re-save the credentials with the new encryption key.

## Option 1: Re-enter Credentials via UI (Recommended)

1. Go to Settings page in your app
2. Re-enter your Cantaloupe username and password
3. Save - this will re-encrypt with the new key

## Option 2: Delete and Re-create via API

If you have access to the raw values, you can delete the old record and create a new one:

```sql
-- 1. First, delete the old encrypted credentials
DELETE FROM user_credentials WHERE user_id = 'your-user-id';

-- 2. Then use the Settings page to re-enter your credentials
```

## Option 3: Manual Re-encryption (Advanced)

If you know the old encryption key and want to migrate:

1. Decrypt with old key
2. Re-encrypt with new key
3. Update database

This would require a custom migration script using both keys.

## Verification

After re-entering credentials, test by:
1. Running a manual DEX collection
2. Checking that no "bad decrypt" errors appear in logs

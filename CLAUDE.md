- NO FAKE AUTH
- NO SERVICE CLIENT
- All API routes for the DEX or CANTALOUPE or MACHINES or DEVICES will require the dex_credentials from the Supabase table under user_credentials.
Everything requires Supabase AUTH and RLS

## Edge Runtime & Cloudflare Pages Requirements

ALL API routes MUST be compatible with Edge Runtime and Cloudflare Pages deployment.

### Required for ALL API routes:

1. **Edge Runtime Export** - Add at the top of EVERY API route file:
   ```javascript
   export const runtime = 'edge'
   ```

2. **Web API Response Format** - Use Web API Response, NOT Express-style responses:
   ```javascript
   // ✅ CORRECT - Web API Response
   export default async function handler(req) {
     return new Response(JSON.stringify({ data }), {
       status: 200,
       headers: { 'Content-Type': 'application/json' }
     })
   }

   // ❌ WRONG - Express-style (not supported)
   export default async function handler(req, res) {
     return res.status(200).json({ data })
   }
   ```

3. **Request Body Parsing** - Use async JSON parsing:
   ```javascript
   // ✅ CORRECT
   const body = await req.json()

   // ❌ WRONG
   const body = req.body
   ```

4. **Query Parameters** - Use URL.searchParams:
   ```javascript
   // ✅ CORRECT
   const url = new URL(req.url)
   const id = url.searchParams.get('id')

   // ❌ WRONG
   const { id } = req.query
   ```

5. **Headers** - Use Web API methods:
   ```javascript
   // ✅ CORRECT
   const token = req.headers.get('authorization')

   // ❌ WRONG
   const token = req.headers['authorization']
   ```

### Forbidden in Edge Runtime:

1. **NO Node.js Modules** - These are NOT supported:
   - ❌ `fs` (file system)
   - ❌ `path`
   - ❌ `crypto` (Node.js version)
   - ❌ `process.cwd()`
   - ❌ Any other Node.js built-in modules

2. **Use Web APIs Instead**:
   ```javascript
   // ✅ CORRECT - Web Crypto API (async)
   import { encrypt, decrypt } from '../../../lib/encryption'
   const encrypted = await encrypt(data)
   const decrypted = await decrypt(encrypted)

   // ❌ WRONG - Node.js crypto
   const crypto = require('crypto')
   ```

3. **File Access** - Use HTTP fetch for static files:
   ```javascript
   // ✅ CORRECT - HTTP fetch
   const baseUrl = req.headers.get('origin') || process.env.NEXT_PUBLIC_SITE_URL
   const fileUrl = `${baseUrl}/data/file.json`
   const response = await fetch(fileUrl)
   const data = await response.json()

   // ❌ WRONG - File system
   const fs = require('fs')
   const data = JSON.parse(fs.readFileSync('./public/data/file.json'))
   ```

### Set-Cookie Headers:

For routes that need to set cookies (like auth):
```javascript
return new Response(JSON.stringify({ success: true }), {
  status: 200,
  headers: {
    'Content-Type': 'application/json',
    'Set-Cookie': `token=${token}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=86400`
  }
})
```

### Error Responses:

Always use Web API Response format:
```javascript
// ✅ CORRECT
return new Response(JSON.stringify({ error: 'Not found' }), {
  status: 404,
  headers: { 'Content-Type': 'application/json' }
})

// ❌ WRONG
return res.status(404).json({ error: 'Not found' })
```

### Handler Signature:

```javascript
// ✅ CORRECT - Single parameter (req)
export default async function handler(req) {
  // handler code
}

// ❌ WRONG - Two parameters (req, res)
export default async function handler(req, res) {
  // handler code
}
```

### Method Checking:

```javascript
// ✅ CORRECT
if (req.method !== 'POST') {
  return new Response(JSON.stringify({ error: 'Method not allowed' }), {
    status: 405,
    headers: {
      'Content-Type': 'application/json',
      'Allow': 'POST'
    }
  })
}
```

### Before Deployment Checklist:

- [ ] All API routes have `export const runtime = 'edge'`
- [ ] All routes use `new Response()` format
- [ ] No Node.js modules (fs, path, crypto, etc.)
- [ ] Request body uses `await req.json()`
- [ ] Query params use `URL.searchParams`
- [ ] Headers use `req.headers.get()`
- [ ] Handler has single parameter `(req)` not `(req, res)`
- [ ] Run `npm run build` successfully before deploying
- [ ] Test all routes locally with Edge Runtime enabled
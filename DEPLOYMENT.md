# Cloudflare Pages Deployment Guide

This guide covers deploying the Vending Machine Management System to Cloudflare Pages.

## Prerequisites

1. **Cloudflare Account** - Sign up at [cloudflare.com](https://cloudflare.com)
2. **GitHub Repository** - Already set up at `https://github.com/jeep15cba/lets_vend.git`
3. **Environment Variables** - You'll need to configure these in Cloudflare Pages

## Deployment Steps

### 1. Connect to Cloudflare Pages

1. Go to [Cloudflare Dashboard](https://dash.cloudflare.com)
2. Navigate to **Pages** section
3. Click **Create a project**
4. Select **Connect to Git**
5. Choose **GitHub** and authorize Cloudflare
6. Select the `lets_vend` repository

### 2. Build Configuration

Configure these build settings:

- **Framework preset**: `Next.js`
- **Build command**: `npm run build`
- **Build output directory**: `.next`
- **Root directory**: `/` (default)
- **Node.js version**: `18.x` (recommended)

### 3. Environment Variables

Add these environment variables in the Cloudflare Pages dashboard:

**Required for Cantaloupe API:**
```
CANTALOUPE_USERNAME=your_cantaloupe_username
CANTALOUPE_PASSWORD=your_cantaloupe_password
CANTALOUPE_MACHINE_ID=your_machine_id
```

**Required for Supabase (optional - app works without it):**
```
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
```

**Optional:**
```
NODE_ENV=production
```

### 4. Deploy

1. Click **Save and Deploy**
2. Cloudflare Pages will automatically build and deploy your site
3. You'll get a `*.pages.dev` URL for your deployment

## Features That Will Work

✅ **Static Pages**: Dashboard, devices list, DEX data display
✅ **API Routes**: All Cantaloupe API endpoints via Cloudflare Functions
✅ **Real-time Data**: DEX data fetching and processing
✅ **Authentication**: Supabase integration (if configured)
✅ **Cash Data**: CA17 denomination display
✅ **Temperature Monitoring**: Both food and beverage machines
✅ **Error Tracking**: EA1-EA9 and ERROR record displays

## Custom Domain (Optional)

To use a custom domain:
1. Go to your Pages project settings
2. Click **Custom domains**
3. Add your domain
4. Update DNS records as instructed

## Monitoring

- **Build logs**: Available in the Cloudflare Pages dashboard
- **Function logs**: Available in the Functions section
- **Analytics**: Built-in Cloudflare analytics

## Troubleshooting

### Build Fails
- Check that all dependencies are in `package.json`
- Verify Node.js version compatibility
- Review build logs in Cloudflare dashboard

### API Routes Not Working
- Ensure environment variables are set correctly
- Check function logs for errors
- Verify Cantaloupe credentials

### Authentication Issues
- Verify Supabase environment variables
- Check CORS settings in Supabase dashboard

## Development Workflow

1. Make changes locally
2. Test with `npm run dev`
3. Build locally with `npm run build` to verify
4. Push to GitHub
5. Cloudflare Pages auto-deploys from `main` branch

## Performance

Cloudflare Pages provides:
- Global CDN distribution
- Automatic HTTPS
- HTTP/3 support
- Built-in DDoS protection
- Fast cold start times for functions

Your vending machine management system will be globally distributed and highly performant!
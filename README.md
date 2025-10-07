# Cantaloupe DEX Dashboard

A Next.js application for retrieving and displaying DEX (Data Exchange) information from Cantaloupe vending machines.

## Features

- 🎯 Direct API integration with Cantaloupe dashboard
- 📊 Comprehensive DEX data display with real-time parsing
- 🔄 Automated DEX collection via Supabase Edge Functions
- 🎨 Clean, responsive UI with Tailwind CSS
- 🛡️ Built-in error handling and data validation
- 👤 User authentication with Supabase
- 🗄️ Machine data storage with historical DEX tracking
- 🔐 Row-level security for multi-user support
- 🎭 Admin impersonation for customer support
- 📱 Device management with inline editing
- 🔄 Drag-and-drop device reordering
- 📥 CSV import/export functionality
- 🎯 Single-device and bulk DEX collection
- 🗑️ Device deletion with confirmation modals

## Quick Start

1. **Clone and install:**
   ```bash
   npm install
   ```

2. **Configure environment:**
   Copy `.env.local.template` to `.env.local` and add your credentials:
   ```bash
   cp .env.local.template .env.local
   ```

3. **Run development server:**
   ```bash
   npm run dev
   ```

4. **Access dashboard:**
   Open [http://localhost:3000](http://localhost:3000)

## Environment Setup

Required environment variables in `.env.local`:

```bash
# Cantaloupe Credentials
CANTALOUPE_USERNAME=your_username
CANTALOUPE_PASSWORD=your_password
CANTALOUPE_MACHINE_ID=22995469

# Supabase Configuration
NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
```

## Supabase Setup

1. **Create a Supabase project**: Go to [supabase.com](https://supabase.com) and create a new project
2. **Run the schema**: Execute the SQL in `supabase/schema.sql` in your Supabase SQL editor
3. **Get your keys**: Copy your Project URL and anon/public key from Project Settings > API
4. **Update environment**: Add the keys to your `.env.local` file

## Project Structure

```
├── pages/
│   ├── api/
│   │   ├── cantaloupe/        # Cantaloupe API integration
│   │   ├── devices/           # Device management endpoints
│   │   ├── dex/               # DEX data collection endpoints
│   │   ├── user/              # User profile and credentials
│   │   ├── admin/             # Admin-only endpoints
│   │   └── settings/          # Company settings
│   ├── index.js               # Login page
│   ├── devices.js             # Main devices dashboard
│   └── settings.js            # Settings page
├── components/
│   ├── Devices.js             # Device list with editing, DEX collection
│   ├── Navigation.js          # Top navigation with impersonation banner
│   └── Settings.js            # Settings page component
├── contexts/
│   └── AuthContext.js         # Authentication and impersonation state
├── lib/
│   ├── supabase/              # Supabase client configuration
│   ├── dex-*.js               # DEX parsing utilities
│   ├── ma5-error-codes.js     # MA5 error code descriptions
│   └── ea1-error-codes.js     # EA1 error code descriptions
├── supabase/
│   ├── functions/             # Edge Functions
│   │   └── collect-dex-standalone/  # DEX collection worker
│   └── migrations/            # Database migrations
└── scripts/
    └── update-machine-types.js  # Maintenance scripts
```

## Development

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run start` - Start production server
- `npm run lint` - Run ESLint

## Key Functionality

### Device Management
- **Action Dropdown Menu**: Edit, Get DEX, or Delete devices via 3-dot menu
- **Inline Editing**: Update machine type, location, and cash settings
- **Drag & Drop Reordering**: Organize devices in custom order
- **Bulk DEX Collection**: Manually trigger DEX collection for all devices
- **Single Device DEX**: Get latest DEX data for specific machine
- **CSV Import/Export**: Bulk update device settings via spreadsheet
- **Click-Outside to Close**: Intuitive UX for editing and dropdowns

### DEX Collection
- **Automated Collection**: Scheduled Edge Function runs every 4 hours
- **Smart Deduplication**: Checks company_id + dex_id combination
- **Historical Tracking**: Stores last 100 DEX records per device (configurable)
- **Real-time Parsing**: Extracts sales, errors, temperature, and coin data
- **Error Descriptions**: Human-readable MA5 and EA1 error codes

### Admin Features
- **User Impersonation**: View other accounts for support without password
- **Visual Indicators**: Yellow banner and background tint during impersonation
- **Service Role Bypass**: Admin sees all data regardless of RLS policies
- **Safe Exit**: One-click return to admin account with page reload

### Security
- **Row-Level Security**: Users only see their own company data
- **Edge Runtime Compatible**: All API routes work with Cloudflare Pages
- **No Service Client Abuse**: Only used for admin impersonation
- **Encrypted Credentials**: Cantaloupe credentials stored encrypted in database

## Roadmap

- [x] Multi-machine support
- [x] User authentication
- [x] Historical data tracking
- [x] Export functionality
- [ ] Data visualization charts
- [ ] Mobile app
- [ ] Custom alerting rules
- [ ] Multi-language support

## Contributing

This project is set up for development with Claude Code. Use the integrated development environment for the best experience.
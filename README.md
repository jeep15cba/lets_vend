# Cantaloupe DEX Dashboard

A Next.js application for retrieving and displaying DEX (Data Exchange) information from Cantaloupe vending machines.

## Features

- 🎯 Direct API integration with Cantaloupe dashboard
- 📊 Raw DEX data display in terminal format
- 🔄 Real-time data refresh
- 🎨 Clean, responsive UI with Tailwind CSS
- 🛡️ Built-in error handling
- 👤 User authentication with Supabase
- 🗄️ Machine data storage and logging
- 🔐 Row-level security for multi-user support

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

- `pages/api/cantaloupe/` - API routes for Cantaloupe integration
- `components/Dashboard.js` - Main dashboard component
- `styles/globals.css` - Global styles and Tailwind configuration

## Development

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run start` - Start production server
- `npm run lint` - Run ESLint

## Roadmap

- [ ] Multi-machine support
- [ ] Data visualization charts
- [ ] Export functionality
- [ ] User authentication
- [ ] Historical data tracking

## Contributing

This project is set up for development with Claude Code. Use the integrated development environment for the best experience.
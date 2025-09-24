# Project.md

## Cantaloupe DEX Dashboard

A Next.js dashboard to retrieve and display DEX (Data Exchange) information from Cantaloupe vending machines.

### Project Goals
- Create a simple dashboard to fetch DEX data from Cantaloupe's API
- Display raw machine data in a clean, readable format
- Start with hardcoded credentials (no user auth initially)
- Build foundation for future features (multi-machine support, data parsing, reporting)

### Technical Stack
- **Framework**: Next.js 14
- **Styling**: Tailwind CSS
- **HTTP Client**: Axios
- **Target API**: `https://dashboard.cantaloupe.online/dex/getRawDex/{machineId}`

### Current Features
- Hardcoded authentication with Cantaloupe dashboard
- Fetch raw DEX data for specific machine (ID: 22995469)
- Display data in terminal-style format
- Basic error handling

### Project Structure
```
cantaloupe-dex-dashboard/
├── pages/
│   ├── api/
│   │   └── cantaloupe/
│   │       ├── auth.js          # Authentication handler
│   │       └── dex-data.js      # DEX data fetcher
│   └── index.js                 # Main dashboard page
├── components/
│   └── Dashboard.js             # Dashboard component
├── styles/
│   └── globals.css              # Global styles with Tailwind
├── package.json
├── next.config.js
├── tailwind.config.js
└── .env.local                   # Environment variables
```

### Environment Variables
Create a `.env.local` file with:
```
CANTALOUPE_USERNAME=your_username_here
CANTALOUPE_PASSWORD=your_password_here
CANTALOUPE_MACHINE_ID=22995469
```

### Getting Started
1. Install dependencies: `npm install`
2. Set up environment variables in `.env.local`
3. Run development server: `npm run dev`
4. Access dashboard at `http://localhost:3000`

### Next Phase Features
- [ ] Multi-machine support
- [ ] Data parsing and visualization
- [ ] Automated data refresh intervals
- [ ] Export functionality
- [ ] User authentication system
- [ ] Historical data storage

### API Endpoints

#### Authentication Flow
1. GET `/login` - Fetch login page and CSRF token
2. POST `/login` - Submit credentials and get auth cookies
3. Use cookies for subsequent API calls

#### Data Retrieval
- `GET /dex/getRawDex/{machineId}` - Fetch raw DEX data for specific machine

### Development Notes
- Authentication cookies are managed server-side
- CSRF tokens are automatically extracted from login page
- Raw DEX data can be either JSON or plain text format
- Error handling includes authentication failures and network issues

---

## package.json

```json
{
  "name": "cantaloupe-dex-dashboard",
  "version": "1.0.0",
  "description": "Dashboard for Cantaloupe vending machine DEX data",
  "private": true,
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "next lint"
  },
  "dependencies": {
    "next": "14.0.0",
    "react": "18.2.0",
    "react-dom": "18.2.0",
    "axios": "^1.6.0"
  },
  "devDependencies": {
    "@types/node": "20.8.0",
    "@types/react": "18.2.0",
    "@types/react-dom": "18.2.0",
    "autoprefixer": "^10.4.0",
    "eslint": "8.52.0",
    "eslint-config-next": "14.0.0",
    "postcss": "^8.4.0",
    "tailwindcss": "^3.3.0"
  },
  "keywords": [
    "vending-machine",
    "cantaloupe",
    "dex",
    "dashboard",
    "nextjs"
  ]
}
```

---

## next.config.js

```javascript
/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  swcMinify: true,
  
  // API configuration
  async headers() {
    return [
      {
        source: '/api/(.*)',
        headers: [
          {
            key: 'Access-Control-Allow-Origin',
            value: '*',
          },
          {
            key: 'Access-Control-Allow-Methods',
            value: 'GET, POST, PUT, DELETE, OPTIONS',
          },
          {
            key: 'Access-Control-Allow-Headers',
            value: 'Content-Type, Authorization, Cookie',
          },
        ],
      },
    ];
  },

  // Environment variables configuration
  env: {
    CANTALOUPE_USERNAME: process.env.CANTALOUPE_USERNAME,
    CANTALOUPE_PASSWORD: process.env.CANTALOUPE_PASSWORD,
    CANTALOUPE_MACHINE_ID: process.env.CANTALOUPE_MACHINE_ID,
  },
};

module.exports = nextConfig;
```

---

## tailwind.config.js

```javascript
/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        'cantaloupe': {
          50: '#fff7ed',
          100: '#ffedd5',
          500: '#f97316',
          600: '#ea580c',
          700: '#c2410c',
        }
      },
      fontFamily: {
        'mono': ['JetBrains Mono', 'Monaco', 'Consolas', 'monospace'],
      }
    },
  },
  plugins: [],
}
```

---

## styles/globals.css

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  html {
    font-family: 'Inter', system-ui, sans-serif;
  }
  
  body {
    background-color: #f8fafc;
  }
}

@layer components {
  .terminal {
    @apply bg-gray-900 text-green-400 font-mono text-sm p-4 rounded-lg overflow-auto;
    max-height: 500px;
  }
  
  .card {
    @apply bg-white rounded-lg shadow-sm border border-gray-200 p-6;
  }
  
  .btn-primary {
    @apply bg-cantaloupe-500 text-white px-4 py-2 rounded-lg hover:bg-cantaloupe-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed;
  }
  
  .btn-secondary {
    @apply bg-gray-500 text-white px-4 py-2 rounded-lg hover:bg-gray-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed;
  }
}

/* Custom scrollbar for terminal */
.terminal::-webkit-scrollbar {
  width: 8px;
}

.terminal::-webkit-scrollbar-track {
  background: #1f2937;
}

.terminal::-webkit-scrollbar-thumb {
  background: #4b5563;
  border-radius: 4px;
}

.terminal::-webkit-scrollbar-thumb:hover {
  background: #6b7280;
}
```

---

## .env.local (template)

```bash
# Cantaloupe Dashboard Credentials
CANTALOUPE_USERNAME=your_username_here
CANTALOUPE_PASSWORD=your_password_here

# Target Machine ID
CANTALOUPE_MACHINE_ID=22995469

# Optional: API Base URL (if different)
CANTALOUPE_BASE_URL=https://dashboard.cantaloupe.online

# Development
NODE_ENV=development
```

---

## .gitignore

```
# Dependencies
/node_modules
/.pnp
.pnp.js

# Testing
/coverage

# Next.js
/.next/
/out/

# Production
/build

# Misc
.DS_Store
*.pem

# Debug
npm-debug.log*
yarn-debug.log*
yarn-error.log*

# Local env files
.env*.local
.env

# Vercel
.vercel

# TypeScript
*.tsbuildinfo
next-env.d.ts

# IDE
.vscode/
.idea/
*.swp
*.swo

# Logs
logs
*.log
```

---

## README.md

```markdown
# Cantaloupe DEX Dashboard

A Next.js application for retrieving and displaying DEX (Data Exchange) information from Cantaloupe vending machines.

## Features

- 🎯 Direct API integration with Cantaloupe dashboard
- 📊 Raw DEX data display in terminal format
- 🔄 Real-time data refresh
- 🎨 Clean, responsive UI with Tailwind CSS
- 🛡️ Built-in error handling

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
CANTALOUPE_USERNAME=your_username
CANTALOUPE_PASSWORD=your_password  
CANTALOUPE_MACHINE_ID=22995469
```

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
```
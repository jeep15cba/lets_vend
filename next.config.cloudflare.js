/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // swcMinify is now enabled by default in Next.js 15

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

  // Environment variables configuration for Cloudflare
  env: {
    CANTALOUPE_USERNAME: process.env.CANTALOUPE_USERNAME,
    CANTALOUPE_PASSWORD: process.env.CANTALOUPE_PASSWORD,
    CANTALOUPE_MACHINE_ID: process.env.CANTALOUPE_MACHINE_ID,
  },

  // Removed global Edge Runtime - using per-route configuration instead
};

module.exports = nextConfig;
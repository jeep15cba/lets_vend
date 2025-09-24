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

  // Environment variables configuration for Cloudflare
  env: {
    CANTALOUPE_USERNAME: process.env.CANTALOUPE_USERNAME,
    CANTALOUPE_PASSWORD: process.env.CANTALOUPE_PASSWORD,
    CANTALOUPE_MACHINE_ID: process.env.CANTALOUPE_MACHINE_ID,
  },

  // Optimize for Edge Runtime
  experimental: {
    runtime: 'edge',
  },
};

module.exports = nextConfig;
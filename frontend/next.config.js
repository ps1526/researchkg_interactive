/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  swcMinify: true,
  
  // Increase serverless function timeout for Vercel deployment
  serverRuntimeConfig: {
    // Maximum execution time for API routes (in seconds)
    apiTimeout: 300, // 5 minutes
  },
  
  // Proxy API requests to Flask backend
  async rewrites() {
    const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:8080';
    console.log(`Using backend URL for rewrites: ${BACKEND_URL}`);
    
    return [
      {
        source: '/analyze',
        destination: `${BACKEND_URL}/analyze`,
      },
      {
        source: '/api/:path*',
        destination: `${BACKEND_URL}/api/:path*`,
      },
      {
        source: '/debug',
        destination: `${BACKEND_URL}/debug`,
      }
    ];
  },
  
  // Optimize memory usage
  experimental: {
    largePageDataBytes: 800 * 1000, // 800KB (increased from the default)
  },
  
  // Increase webpack memory limit
  webpack: (config, { isServer }) => {
    // Decrease frequency of chunk size warnings
    config.performance.hints = false;
    
    // Cache webpack compilation for faster rebuilds
    config.cache = true;
    
    return config;
  },
};

module.exports = nextConfig;
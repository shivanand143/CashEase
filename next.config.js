/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone', // Good for deployments, ensure your deployment platform supports this
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**', // Allows any HTTPS hostname
      },
       {
        protocol: 'http', // Allows any HTTP hostname (be cautious in production)
        hostname: '**',
      },
    ],
  },
   typescript: {
      // CRITICAL: This MUST be false for production builds
      // and to catch errors that can lead to missing chunks.
      ignoreBuildErrors: false,
    },
  // Add any other stable configurations you need here.
  // Avoid highly experimental features if you're facing build issues.
};

module.exports = nextConfig;

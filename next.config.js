/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone', // Recommended for Firebase App Hosting / Cloud Run
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
  productionBrowserSourceMaps: true, // Explicitly enable source maps for easier debugging of client-side code
  // Add any other stable configurations you need here.
  // Avoid highly experimental features if you're facing build issues.
};

module.exports = nextConfig;

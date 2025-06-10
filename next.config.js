
/** @type {import('next').NextConfig} */
const nextConfig = {
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
  output: 'standalone', // Recommended for server deployments (like Firebase App Hosting)
  
  devIndicators: {
    // Ensure development origins are correctly configured for preview environments.
    allowedDevOrigins: [
      "http://localhost:3000", 
      "http://localhost:6000",
      "https://*.cloudworkstations.dev", 
      "https://*.googleusercontent.com", 
      "http://localhost:9002"
    ]
  }
};

module.exports = nextConfig;

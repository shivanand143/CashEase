/** @type {import('next').NextConfig} */
const nextConfig = {
  // Your Next.js config options go here
  // For example:
  // reactStrictMode: true,
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**', // Wildcard to allow any hostname
      },
       {
        protocol: 'http', // Also allow http if needed, be cautious
        hostname: '**',
      },
    ],
  },
   typescript: {
      // !! WARN !!
      // Dangerously allow production builds to successfully complete even if
      // your project has type errors.
      // !! WARN !!
      ignoreBuildErrors: false, // CRITICAL: Set to false to reveal underlying errors
    },
};

module.exports = nextConfig;


/** @type {import('next').NextConfig} */
const nextConfig = {
  // Your Next.js config options go here
  // For example:
  // reactStrictMode: true,
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'picsum.photos',
        port: '',
        pathname: '/**', // Allow any path under picsum.photos
      },
    ],
  },
};

module.exports = nextConfig;

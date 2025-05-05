
import type {NextConfig} from 'next';

const nextConfig: NextConfig = {
  typescript: {
    // !! WARN !!
    // Dangerously allow production builds to successfully complete even if
    // your project has type errors.
    // !! WARN !!
    ignoreBuildErrors: true, // Set to false for stricter type checking
  },
  eslint: {
    // Warning: This allows production builds to successfully complete even if
    // your project has ESLint errors.
    ignoreDuringBuilds: true, // Set to false for stricter linting
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'picsum.photos', // Placeholder images
        port: '',
        pathname: '/**',
      },
       // Add other trusted image domains here if needed
       // e.g., for store logos from specific CDNs
      // {
      //   protocol: 'https',
      //   hostname: 'your-cdn-hostname.com',
      //   port: '',
      //   pathname: '/**',
      // },
    ],
  },
};

export default nextConfig;

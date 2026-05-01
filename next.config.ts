import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  compress: true,
  experimental: {
    optimizePackageImports: ['lucide-react', 'react-icons'],
  },
  images: {
    formats: ['image/avif', 'image/webp'],
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**.supabase.co',
      },
      {
        protocol: 'https',
        hostname: '**.googleusercontent.com',
      },
    ],
  },
  webpack: (config, { dev }) => {
    if (dev) {
      // Prevent corrupted webpack filesystem cache in local dev causing
      // "__webpack_modules__[moduleId] is not a function" runtime crashes.
      config.cache = false;
    }
    return config;
  },
};

export default nextConfig;

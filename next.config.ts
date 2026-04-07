import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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

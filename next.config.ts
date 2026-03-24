import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    optimizePackageImports: ['react-icons/fa', 'react-icons/fa6', 'lucide-react'],
  },
};

export default nextConfig;

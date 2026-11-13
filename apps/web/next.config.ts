import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Workspace packages ship TypeScript source (no build step between packages).
  transpilePackages: ['@boramarca/shared'],
};

export default nextConfig;

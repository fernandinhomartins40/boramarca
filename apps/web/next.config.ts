import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // .next/standalone/apps/web/server.js runs without node_modules; `next start` still serves
  // (it only logs a warning), so infra/docker/web.Dockerfile works as is.
  output: 'standalone',
  // Workspace packages ship TypeScript source (no build step between packages).
  transpilePackages: ['@boramarca/shared'],
};

export default nextConfig;

import type { NextConfig } from 'next';

const apiProxyBase = process.env.API_PROXY_URL?.replace(/\/$/, '');

const nextConfig: NextConfig = {
  outputFileTracingRoot: process.cwd(),
  productionBrowserSourceMaps: false,
  async rewrites() {
    if (apiProxyBase) {
      return [
        { source: '/api/:path*', destination: `${apiProxyBase}/api/:path*` },
        { source: '/program/:path*', destination: `${apiProxyBase}/program/:path*` },
      ];
    }

    return [];
  },
};

export default nextConfig;

import type { NextConfig } from "next";

const uploadBodyLimit = "256mb";

const nextConfig: NextConfig = {
  turbopack: {
    root: process.cwd(),
  },
  experimental: {
    proxyClientMaxBodySize: uploadBodyLimit,
    serverActions: {
      bodySizeLimit: uploadBodyLimit,
    },
  },
};

export default nextConfig;

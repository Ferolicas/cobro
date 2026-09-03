import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  serverExternalPackages: ["@prisma/client", "@prisma/adapter-pg", "pg"],
  experimental: {
    serverActions: {
      bodySizeLimit: "2mb",
    },
  },
};

export default nextConfig;

import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@pocket-codex/protocol", "@pocket-codex/crypto"],
  experimental: {
    externalDir: true,
  },
};

export default nextConfig;

import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  agentRules: false,
  reactStrictMode: true,
  poweredByHeader: false,
  serverExternalPackages: ["postgres"],
};

export default nextConfig;

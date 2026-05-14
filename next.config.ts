import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Don't use "export" — it breaks dynamic routes and API routes
  // Cloudflare Workers with nodejs_compat handles Node.js APIs
  serverExternalPackages: ["@moikapy/origen"],
};

export default nextConfig;
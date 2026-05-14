import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Cloudflare Workers — OpenNext handles the serverless build
  // Don't use "export" — it breaks dynamic routes and API routes
};

export default nextConfig;
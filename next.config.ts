import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Cloudflare Workers — no server-side features
  output: "export",
};

export default nextConfig;
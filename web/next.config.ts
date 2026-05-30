import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Pin the workspace root to this app so Next.js doesn't infer a parent
  // monorepo root from unrelated lockfiles above the repo.
  turbopack: {
    root: path.join(__dirname),
  },
};

export default nextConfig;

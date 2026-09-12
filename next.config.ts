import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  outputFileTracingIncludes: {
    "/*": ["./drizzle/**/*.sql", "./drizzle/meta/_journal.json"],
  },
};

export default nextConfig;

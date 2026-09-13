import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "i.ytimg.com",
        pathname: "/vi/**",
      },
    ],
  },
  outputFileTracingIncludes: {
    "/*": ["./drizzle/**/*.sql", "./drizzle/meta/_journal.json"],
  },
};

export default nextConfig;

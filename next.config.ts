import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    return [
      {
        source: "/trpg",
        destination: "/tales/trpg",
        permanent: true,
      },
      {
        source: "/trpg/:path*",
        destination: "/tales/trpg/:path*",
        permanent: true,
      },
    ];
  },
};

export default nextConfig;

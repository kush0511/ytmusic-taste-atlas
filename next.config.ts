import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "export",
  basePath: process.env.GITHUB_ACTIONS ? "/ytmusic-taste-atlas" : "",
  images: {
    unoptimized: true,
  },
};

export default nextConfig;

import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Self-contained server bundle, used by the Docker image.
  output: "standalone",
};

export default nextConfig;

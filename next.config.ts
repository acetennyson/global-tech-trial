import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Builds a standalone server for the Docker image.
  output: "standalone",
};

export default nextConfig;

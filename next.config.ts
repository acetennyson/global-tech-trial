import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Builds a standalone server for the Docker image.
  output: "standalone",
  poweredByHeader: false,
  async headers() {
    return [
      // The JSON API and the health check are not pages. Keep them out of search results
      // even if some site links to them (robots.txt alone doesn't stop that).
      { source: "/api/:path*", headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }] },
      { source: "/health", headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }] },
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "origin-when-cross-origin" },
        ],
      },
    ];
  },
};

export default nextConfig;

import type { MetadataRoute } from "next";
import { getSiteUrl } from "@/lib/site";

// Crawlers may read the pages. The JSON API and the health check are not content, so they are off limits.
export default function robots(): MetadataRoute.Robots {
  const base = getSiteUrl();
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/api/", "/health"] }],
    sitemap: `${base}/sitemap.xml`,
    host: base,
  };
}

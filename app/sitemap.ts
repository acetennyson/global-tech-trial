import type { MetadataRoute } from "next";
import { absoluteUrl, pages } from "@/lib/site";

// Rebuilt on every deploy, so lastModified is the deploy time.
export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();
  return pages.map((page) => ({
    url: absoluteUrl(page.path),
    lastModified,
    changeFrequency: page.path === "/" ? "weekly" : "monthly",
    priority: page.priority,
  }));
}

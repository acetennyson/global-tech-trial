// One place for everything search engines and social cards should know about this site.
// Values that only you know (domain, social profiles, contact email, verification codes) come
// from env vars, so nothing here is invented. See "SEO and Google Search Console" in the README.

function clean(url: string): string {
  return url.trim().replace(/\/+$/, "");
}

/** Public base URL of the deployed site, no trailing slash. Set NEXT_PUBLIC_SITE_URL in production. */
export function getSiteUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL || process.env.APP_URL;
  if (explicit) return clean(explicit);
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) return clean(`https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`);
  return "http://localhost:3000";
}

export function absoluteUrl(path = "/"): string {
  return `${getSiteUrl()}${path.startsWith("/") ? path : `/${path}`}`;
}

function list(value: string | undefined): string[] {
  return (value ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

export const site = {
  name: "Task Manager API",
  tagline: "REST API for tasks with JWT auth, version-checked edits and offline sync",
  title: "Task Manager REST API with Offline Sync | iamsupreme developers",
  description:
    "A REST API for tasks with JWT auth, version-checked edits and offline sync. Built by Ado Daniel NJ | iamsupreme developers",
  keywords: [
    "task manager API",
    "REST API for tasks",
    "task API with JWT authentication",
    "offline sync API",
    "idempotent API",
    "optimistic concurrency",
    "Next.js REST API",
    "Postgres task API",
    "iamsupreme developers",
    "Ado Daniel NJ",
    "software developers in Douala",
    "Cameroon developers",
    "developer",
    "task",
    "productivity",
    "free",
    "tool",
    "SAAS",
  ],
  language: "en",
  locale: "en_US",
  themeColor: "#0071e3",
  owner: {
    name: "Ado Daniel NJ",
    jobTitle: process.env.SITE_OWNER_JOB_TITLE || undefined,
  },
  organization: {
    name: "iamsupreme developers",
    email: process.env.SITE_CONTACT_EMAIL || undefined,
  },
  // Profiles that belong to the person or the organization (GitHub, LinkedIn, X ...), comma separated.
  sameAs: list(process.env.SITE_SAME_AS),
  location: {
    locality: process.env.SITE_LOCALITY || "Douala",
    region: process.env.SITE_REGION || "Littoral",
    country: process.env.SITE_COUNTRY || "CM",
    countryName: "Cameroon",
    // City-level coordinates, not a street address.
    latitude: Number(process.env.SITE_LATITUDE || 4.0511),
    longitude: Number(process.env.SITE_LONGITUDE || 9.7679),
  },
  verification: {
    google: process.env.GOOGLE_SITE_VERIFICATION || undefined,
    bing: process.env.BING_SITE_VERIFICATION || undefined,
    yandex: process.env.YANDEX_SITE_VERIFICATION || undefined,
  },
} as const;

export const placeLabel = `${site.location.locality}, ${site.location.countryName}`;

// Contact address for the legal pages (Terms, Privacy, Acceptable Use). Falls back to an
// address on the deployed domain itself, so the pages never render without a way to reach us,
// even before SITE_CONTACT_EMAIL is set.
export const legalEmail = site.organization.email || `legal@${new URL(getSiteUrl()).hostname}`;

export const pages = [
  { path: "/", name: "Home", priority: 1 },
  { path: "/docs", name: "API documentation", priority: 0.9 },
  { path: "/about", name: "About", priority: 0.6 },
  { path: "/terms", name: "Terms of Use", priority: 0.3 },
  { path: "/privacy", name: "Privacy Policy", priority: 0.3 },
  { path: "/acceptable-use", name: "Acceptable Use Policy", priority: 0.3 },
] as const;

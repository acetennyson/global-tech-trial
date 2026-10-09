import type { Metadata } from "next";
import { absoluteUrl, getSiteUrl, placeLabel, site } from "./site";

// ---------- metadata ----------

/** Per-page metadata. Each page sets its own canonical URL, Open Graph and Twitter card. */
export function pageMetadata(opts: { title: string; description: string; path: string; absoluteTitle?: boolean }): Metadata {
  const url = absoluteUrl(opts.path);
  const fullTitle = opts.absoluteTitle ? opts.title : `${opts.title} | ${site.name}`;
  return {
    title: opts.absoluteTitle ? { absolute: opts.title } : opts.title,
    description: opts.description,
    alternates: { canonical: url, languages: { [site.language]: url, "x-default": url } },
    openGraph: {
      type: "website",
      url,
      siteName: site.name,
      title: fullTitle,
      description: opts.description,
      locale: site.locale,
      // Set explicitly: a page that sets openGraph replaces the layout's, and the card image must not be lost.
      images: [{ url: absoluteUrl("/opengraph-image"), width: 1200, height: 630, alt: `${site.name} by ${site.organization.name}` }],
    },
    twitter: {
      card: "summary_large_image",
      title: fullTitle,
      description: opts.description,
      images: [{ url: absoluteUrl("/twitter-image"), alt: `${site.name} by ${site.organization.name}` }],
    },
  };
}

// ---------- structured data (JSON-LD) ----------

const id = {
  org: () => `${getSiteUrl()}/#organization`,
  person: () => `${getSiteUrl()}/#person`,
  website: () => `${getSiteUrl()}/#website`,
  app: () => `${getSiteUrl()}/#app`,
};

const address = () => ({
  "@type": "PostalAddress",
  addressLocality: site.location.locality,
  addressRegion: site.location.region,
  addressCountry: site.location.country,
});

const place = () => ({
  "@type": "Place",
  name: placeLabel,
  address: address(),
  geo: { "@type": "GeoCoordinates", latitude: site.location.latitude, longitude: site.location.longitude },
});

export function organizationLd() {
  return {
    "@type": "Organization",
    "@id": id.org(),
    name: site.organization.name,
    url: getSiteUrl(),
    logo: { "@type": "ImageObject", url: absoluteUrl("/icon-512.png"), width: 512, height: 512 },
    address: address(),
    location: place(),
    ...(site.organization.email ? { email: site.organization.email } : {}),
    ...(site.sameAs.length ? { sameAs: site.sameAs } : {}),
  };
}

export function personLd() {
  return {
    "@type": "Person",
    "@id": id.person(),
    name: site.owner.name,
    url: absoluteUrl("/about"),
    worksFor: { "@id": id.org() },
    homeLocation: place(),
    ...(site.owner.jobTitle ? { jobTitle: site.owner.jobTitle } : {}),
    ...(site.sameAs.length ? { sameAs: site.sameAs } : {}),
  };
}

export function websiteLd() {
  return {
    "@type": "WebSite",
    "@id": id.website(),
    url: getSiteUrl(),
    name: site.name,
    description: site.description,
    inLanguage: site.language,
    publisher: { "@id": id.org() },
    creator: { "@id": id.person() },
  };
}

export function webApplicationLd() {
  return {
    "@type": "WebApplication",
    "@id": id.app(),
    name: site.name,
    url: getSiteUrl(),
    description: site.description,
    applicationCategory: "DeveloperApplication",
    applicationSubCategory: "REST API",
    operatingSystem: "Any (HTTP API)",
    browserRequirements: "Requires JavaScript for the in-page API playground",
    inLanguage: site.language,
    featureList: [
      "JWT authentication with password reset",
      "Version-checked edits that return 409 on conflicts",
      "Idempotent task creation with Idempotency-Key",
      "Bulk update and delete",
      "Offline sync: push operations and pull changes with a cursor",
      "Rate limiting on sign-in endpoints",
      "CORS support for browser apps",
    ],
    author: { "@id": id.person() },
    creator: { "@id": id.org() },
    publisher: { "@id": id.org() },
    countryOfOrigin: { "@type": "Country", name: site.location.countryName },
    softwareHelp: { "@type": "WebPage", url: absoluteUrl("/docs") },
  };
}

export function breadcrumbLd(items: { name: string; path: string }[]) {
  const self = items[items.length - 1].path;
  return {
    "@type": "BreadcrumbList",
    "@id": `${absoluteUrl(self)}#breadcrumb`,
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      item: absoluteUrl(item.path),
    })),
  };
}

export function webPageLd(opts: { path: string; name: string; description: string; type?: string; breadcrumbs?: boolean }) {
  return {
    "@type": opts.type ?? "WebPage",
    "@id": `${absoluteUrl(opts.path)}#webpage`,
    url: absoluteUrl(opts.path),
    name: opts.name,
    description: opts.description,
    inLanguage: site.language,
    isPartOf: { "@id": id.website() },
    about: { "@id": id.app() },
    publisher: { "@id": id.org() },
    ...(opts.breadcrumbs === false ? {} : { breadcrumb: { "@id": `${absoluteUrl(opts.path)}#breadcrumb` } }),
  };
}

export function faqLd(faqs: { question: string; answer: string }[]) {
  return {
    "@type": "FAQPage",
    mainEntity: faqs.map((faq) => ({
      "@type": "Question",
      name: faq.question,
      acceptedAnswer: { "@type": "Answer", text: faq.answer },
    })),
  };
}

export function techArticleLd(opts: { path: string; headline: string; description: string }) {
  return {
    "@type": "TechArticle",
    "@id": `${absoluteUrl(opts.path)}#article`,
    headline: opts.headline,
    description: opts.description,
    url: absoluteUrl(opts.path),
    inLanguage: site.language,
    author: { "@id": id.person() },
    publisher: { "@id": id.org() },
    mainEntityOfPage: { "@id": `${absoluteUrl(opts.path)}#webpage` },
    about: { "@id": id.app() },
  };
}

export function graph(...nodes: object[]) {
  return { "@context": "https://schema.org", "@graph": nodes };
}

/** JSON for a <script type="application/ld+json">. "<" is escaped so content can never close the tag. */
export function jsonLdString(data: object): string {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}

// Entities every page shares. Rendered once, in the root layout.
export function siteGraph() {
  return graph(organizationLd(), personLd(), websiteLd(), webApplicationLd());
}

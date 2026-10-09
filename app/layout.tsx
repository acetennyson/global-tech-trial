import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import JsonLd from "./_components/JsonLd";
import { siteGraph } from "@/lib/seo";
import { absoluteUrl, getSiteUrl, site } from "@/lib/site";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
  display: "swap",
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  display: "swap",
});

// Site-wide defaults. Each page sets its own title, description, canonical URL and cards
// (see pageMetadata in lib/seo.ts), because a page's openGraph replaces this one entirely.
export const metadata: Metadata = {
  metadataBase: new URL(getSiteUrl()),
  title: { default: site.title, template: `%s | ${site.name}` },
  description: site.description,
  applicationName: site.name,
  keywords: [...site.keywords],
  authors: [{ name: site.owner.name, url: absoluteUrl("/about") }],
  creator: site.owner.name,
  publisher: site.organization.name,
  category: "technology",
  referrer: "origin-when-cross-origin",
  formatDetection: { email: false, address: false, telephone: false },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, "max-image-preview": "large", "max-snippet": -1, "max-video-preview": -1 },
  },
  verification: {
    google: site.verification.google,
    yandex: site.verification.yandex,
    other: site.verification.bing ? { "msvalidate.01": site.verification.bing } : undefined,
  },
  // Where the publisher is based, for search engines that read geo meta tags.
  other: {
    "geo.region": `${site.location.country}-LT`,
    "geo.placename": site.location.locality,
    "geo.position": `${site.location.latitude};${site.location.longitude}`,
    ICBM: `${site.location.latitude}, ${site.location.longitude}`,
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: site.themeColor,
  colorScheme: "light",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang={site.language} className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        <a
          href="#top"
          className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[100] focus:rounded-md focus:bg-white focus:px-4 focus:py-2 focus:text-sm focus:shadow"
        >
          Skip to content
        </a>
        <JsonLd data={siteGraph()} />
        {children}
      </body>
    </html>
  );
}

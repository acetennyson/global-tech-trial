import type { Metadata } from "next";
import Link from "next/link";
import { SiteFooter, SiteHeader } from "./_components/SiteChrome";

// A real 404 page. noindex keeps broken URLs (like the emailed /reset-password link) out of search results.
export const metadata: Metadata = {
  title: "Page not found",
  robots: { index: false, follow: true },
};

export default function NotFound() {
  return (
    <>
      <SiteHeader />
      <main id="top" className="tone-light flex-1 bg-[var(--bg)] px-6 py-32 text-center text-[var(--fg)]">
        <h1 className="text-5xl font-semibold tracking-[-0.04em]">Page not found.</h1>
        <p className="mx-auto mt-6 max-w-md text-xl text-[var(--mute)]">That page doesn&apos;t exist. Try one of these instead.</p>
        <p className="mt-8 flex justify-center gap-8 text-[17px]">
          <Link href="/" className="text-[#0066cc] hover:underline">Home</Link>
          <Link href="/docs" className="text-[#0066cc] hover:underline">API documentation</Link>
          <Link href="/about" className="text-[#0066cc] hover:underline">About</Link>
        </p>
      </main>
      <SiteFooter />
    </>
  );
}

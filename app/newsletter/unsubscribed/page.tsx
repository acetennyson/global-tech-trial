import type { Metadata } from "next";
import Link from "next/link";
import { SiteFooter, SiteHeader } from "../../_components/SiteChrome";

export const metadata: Metadata = {
  title: "Unsubscribed",
  robots: { index: false, follow: true },
};

export default async function NewsletterUnsubscribedPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { status } = await searchParams;
  const invalid = status === "invalid";

  return (
    <>
      <SiteHeader />
      <main id="top" className="tone-light flex-1 bg-[var(--bg)] px-6 py-32 text-center text-[var(--fg)]">
        <h1 className="text-5xl font-semibold tracking-[-0.04em]">
          {invalid ? "That link isn’t valid." : "You’re unsubscribed."}
        </h1>
        <p className="mx-auto mt-6 max-w-md text-xl text-[var(--mute)]">
          {invalid
            ? "That unsubscribe link has already been used or doesn’t exist. If you’re still receiving email you didn’t ask for, contact us."
            : "You won’t receive any more news or updates by email. You can resubscribe at any time from the home page."}
        </p>
        <p className="mt-8 flex justify-center gap-8 text-[17px]">
          <Link href="/" className="text-[#0066cc] hover:underline">Home</Link>
          <Link href="/privacy" className="text-[#0066cc] hover:underline">Privacy Policy</Link>
        </p>
      </main>
      <SiteFooter />
    </>
  );
}

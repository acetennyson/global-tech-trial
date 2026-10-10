import type { Metadata } from "next";
import Link from "next/link";
import { SiteFooter, SiteHeader } from "../../_components/SiteChrome";

export const metadata: Metadata = {
  title: "Email verified",
  robots: { index: false, follow: true },
};

export default async function VerifyEmailConfirmedPage({
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
          {invalid ? "That link isn’t valid." : "Email verified."}
        </h1>
        <p className="mx-auto mt-6 max-w-md text-xl text-[var(--mute)]">
          {invalid
            ? "That verification link has already been used or has expired. Request a new one with POST /api/auth/resend-verification."
            : "You can now create, edit, delete, and sync tasks. Reads and sign-in already worked before this."}
        </p>
        <p className="mt-8 flex justify-center gap-8 text-[17px]">
          <Link href="/" className="text-[#0066cc] hover:underline">Home</Link>
          <Link href="/docs" className="text-[#0066cc] hover:underline">API documentation</Link>
        </p>
      </main>
      <SiteFooter />
    </>
  );
}

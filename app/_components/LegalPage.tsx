import Link from "next/link";
import type { ReactNode } from "react";

// Shared chrome for the legal pages (Terms of Use, Privacy Policy, Acceptable Use Policy).
// Keeps the heading, breadcrumb, "last updated" line and section spacing consistent across all three.

export function LegalArticle({
  title,
  lastUpdated,
  intro,
  breadcrumbLabel,
  children,
}: {
  title: string;
  lastUpdated: string;
  intro: ReactNode;
  breadcrumbLabel: string;
  children: ReactNode;
}) {
  return (
    <main id="top" className="tone-light flex-1 bg-[var(--bg)] px-6 pb-24 pt-16 text-[var(--fg)]">
      <article className="mx-auto max-w-3xl">
        <nav aria-label="Breadcrumb" className="text-[13px] text-[var(--mute)]">
          <ol className="flex gap-2">
            <li><Link href="/" className="text-[#0066cc] hover:underline">Home</Link></li>
            <li aria-hidden="true">/</li>
            <li aria-current="page">{breadcrumbLabel}</li>
          </ol>
        </nav>

        <h1 className="mt-6 text-5xl font-semibold leading-[1.05] tracking-[-0.04em] sm:text-6xl">{title}</h1>
        <p className="mt-4 text-[13px] text-[var(--mute)]">Last updated: {lastUpdated}</p>

        <div className="mt-8 space-y-4 text-[17px] leading-relaxed text-[#424245]">{intro}</div>

        <div className="legal-body mt-12 space-y-10 text-[17px] leading-relaxed text-[#424245]">{children}</div>
      </article>
    </main>
  );
}

export function LegalSection({
  id,
  heading,
  children,
}: {
  id: string;
  heading: string;
  children: ReactNode;
}) {
  return (
    <section aria-labelledby={id} className="space-y-4">
      <h2 id={id} className="text-2xl font-semibold tracking-[-0.02em] text-[var(--fg)]">{heading}</h2>
      {children}
    </section>
  );
}

import Link from "next/link";
import { placeLabel, site } from "@/lib/site";

const links = [
  { href: "/", label: "Home" },
  { href: "/docs", label: "API docs" },
  { href: "/about", label: "About" },
];

const legalLinks = [
  { href: "/terms", label: "Terms of Use" },
  { href: "/privacy", label: "Privacy Policy" },
  { href: "/acceptable-use", label: "Acceptable Use" },
];

// Header for the pages that are not the home page (the home page has its own, with in-page anchors).
export function SiteHeader() {
  return (
    <header className="glass-nav sticky top-0 z-50 border-b border-black/10">
      <nav aria-label="Main" className="mx-auto flex h-12 max-w-5xl items-center justify-between px-6 text-[13px]">
        <Link href="/" className="text-[15px] font-semibold tracking-tight">{site.name}</Link>
        <ul className="flex gap-7 text-[#424245]">
          {links.slice(1).map((link) => (
            <li key={link.href}><Link href={link.href} className="hover:text-black">{link.label}</Link></li>
          ))}
        </ul>
      </nav>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="tone-gray bg-[var(--bg)] px-6 py-10 text-center text-xs text-[var(--mute)]">
      <nav aria-label="Footer" className="mb-4">
        <ul className="flex flex-wrap justify-center gap-x-6 gap-y-2 text-[13px]">
          {links.map((link) => (
            <li key={link.href}><Link href={link.href} className="text-[#0066cc] hover:underline">{link.label}</Link></li>
          ))}
        </ul>
      </nav>
      <nav aria-label="Legal" className="mb-4">
        <ul className="flex flex-wrap justify-center gap-x-6 gap-y-2 text-[13px]">
          {legalLinks.map((link) => (
            <li key={link.href}><Link href={link.href} className="text-[#0066cc] hover:underline">{link.label}</Link></li>
          ))}
        </ul>
      </nav>
      <p>
        {site.name} is built by <Link href="https://adodanielnj.vercel.app" className="text-[#0066cc] hover:underline">{site.owner.name}</Link> {/* at{" "}
        {site.organization.name}, {placeLabel} */}.
      </p>
      <p className="mt-2">Built with Next.js route handlers and Postgres.</p>
    </footer>
  );
}

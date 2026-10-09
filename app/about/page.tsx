import type { Metadata } from "next";
import Link from "next/link";
import JsonLd from "../_components/JsonLd";
import { SiteFooter, SiteHeader } from "../_components/SiteChrome";
import { breadcrumbLd, graph, pageMetadata, webPageLd } from "@/lib/seo";
import { placeLabel, site } from "@/lib/site";

const path = "/about";
const title = `About ${site.owner.name} and ${site.organization.name}`;
const description = `The Task Manager API is built by ${site.owner.name} at ${site.organization.name}, a software development team in ${placeLabel}. Who is behind it and where to start.`;

export const metadata: Metadata = pageMetadata({ title, description, path });

export default function AboutPage() {
  return (
    <>
      <SiteHeader />
      <main id="top" className="tone-light flex-1 bg-[var(--bg)] px-6 pb-24 pt-16 text-[var(--fg)]">
        <article className="mx-auto max-w-3xl">
          <nav aria-label="Breadcrumb" className="text-[13px] text-[var(--mute)]">
            <ol className="flex gap-2">
              <li><Link href="/" className="text-[#0066cc] hover:underline">Home</Link></li>
              <li aria-hidden="true">/</li>
              <li aria-current="page">About</li>
            </ol>
          </nav>

          <h1 className="mt-6 text-5xl font-semibold leading-[1.05] tracking-[-0.04em] sm:text-6xl">
            About Creator{/* {site.owner.name} and {site.organization.name} */}
          </h1>
          <p className="mt-6 text-xl leading-snug text-[var(--mute)]">
            The Task Manager API is built and maintained by {site.owner.name}{/*  at {site.organization.name}, in {placeLabel} */}.
          </p>

          <section aria-labelledby="who" className="mt-14 space-y-4 text-[17px] leading-relaxed text-[#424245]">
            <h2 id="who" className="text-3xl font-semibold tracking-[-0.02em] text-[var(--fg)]">Who is behind it</h2>
            <p><Link style={{fontSize: "20px", fontFamily: "-apple-system", color: "dark-red", textDecorationLine: "blink", textShadow: "1px 1px black"}} href={"https://adodanielnj.vercel.app"}>Ado Daniel NJ</Link></p>
            {/* <p>
              <strong>{site.owner.name}</strong> is the developer of the Task Manager API, working with{" "}
              <strong>{site.organization.name}</strong>, a software development team in {site.location.locality},{" "}
              {site.location.region} region, {site.location.countryName}.
            </p> */}
          </section>

          <section aria-labelledby="what" className="mt-12 space-y-4 text-[17px] leading-relaxed text-[#424245]">
            <h2 id="what" className="text-3xl font-semibold tracking-[-0.02em] text-[var(--fg)]">What the API is for</h2>
            <p>
              Apps that manage tasks need the same things from a backend: sign-in, safe concurrent edits, retries that don&apos;t
              create duplicates, and a way to catch up after being offline. The Task Manager API provides those as a plain REST
              API, with JWT authentication, version-checked edits, idempotent creates and an offline sync API.
            </p>
            {/* <p>
              It runs on Next.js route handlers and Postgres, and browser apps on other domains can call it with CORS support.
            </p> */}
          </section>

          <section aria-labelledby="where" className="mt-12 space-y-4 text-[17px] leading-relaxed text-[#424245]">
            <h2 id="where" className="text-3xl font-semibold tracking-[-0.02em] text-[var(--fg)]">Where we are</h2>
            <p>
              The API itself is hosted online and is available to apps
              anywhere.
            </p>
          </section>

          <section aria-labelledby="next" className="mt-12 space-y-4 text-[17px] leading-relaxed text-[#424245]">
            <h2 id="next" className="text-3xl font-semibold tracking-[-0.02em] text-[var(--fg)]">Start using it</h2>
            <ul className="list-disc space-y-2 pl-6">
              <li><Link href="/docs" className="text-[#0066cc] hover:underline">Read the API documentation</Link></li>
              <li><Link href="/#account" className="text-[#0066cc] hover:underline">Try the live playground</Link></li>
              <li><Link href="/" className="text-[#0066cc] hover:underline">Back to the Task Manager API home page</Link></li>
            </ul>
          </section>
        </article>
      </main>
      <SiteFooter />
      <JsonLd
        data={graph(
          webPageLd({ path, name: title, description, type: "AboutPage" }),
          breadcrumbLd([
            { name: "Home", path: "/" },
            { name: "About", path },
          ])
        )}
      />
    </>
  );
}

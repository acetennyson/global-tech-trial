import type { Metadata } from "next";
import Link from "next/link";
import JsonLd from "./_components/JsonLd";
import Playground from "./_components/Playground";
import { SiteFooter } from "./_components/SiteChrome";
import { faqLd, graph, pageMetadata, webPageLd } from "@/lib/seo";
import { placeLabel, site } from "@/lib/site";

export const metadata: Metadata = pageMetadata({
  title: site.title,
  description: site.description,
  path: "/",
  absoluteTitle: true,
});

const features: { title: string; text: string }[] = [
  {
    title: "JWT authentication",
    text: "Register and log in to get a Bearer token. Passwords are hashed with bcrypt, and password reset links are single-use and expire after one hour.",
  },
  {
    title: "Version-checked edits",
    text: "Every task carries a version. A save with a stale version gets a 409 with the current task, so two people editing at once never overwrite each other.",
  },
  {
    title: "Idempotent creates",
    text: "Send an Idempotency-Key with a create. If the connection drops and you retry, you get the original task back instead of a duplicate.",
  },
  {
    title: "Offline sync API",
    text: "Push a batch of offline operations to one endpoint and pull everything that changed since a cursor, including deletes. The API side of offline-first apps.",
  },
  {
    title: "Bulk updates and deletes",
    text: "Change or remove many of your tasks in one all-or-nothing request, with optional per-task version checks.",
  },
  {
    title: "Rate limits and CORS",
    text: "Sign-in endpoints are rate limited, and browser apps on other domains can call the API with CORS support.",
  },
];

const faqs: { question: string; answer: string }[] = [
  {
    question: "What is the Task Manager API?",
    answer:
      "It is a REST API for managing tasks. It has JWT authentication, filtering and pagination, version-checked edits, idempotent creates, bulk operations and an offline sync API, running on Next.js route handlers and Postgres.",
  },
  {
    question: "Who builds the Task Manager API?",
    answer: `It is built by ${site.owner.name} at ${site.organization.name}, based in ${placeLabel}.`,
  },
  {
    question: "How does authentication work?",
    answer:
      "Create an account with POST /api/auth/register or sign in with POST /api/auth/login. Both return a JWT, which you send as an Authorization: Bearer header on every other request. A missing, bad or expired token returns 401.",
  },
  {
    question: "How does it stop two people overwriting each other's edits?",
    answer:
      "Each task has a version number. An update must include the version you last saw. If the task has changed since, the API returns 409 Conflict with the current task, so you can merge and retry.",
  },
  {
    question: "Does it support offline sync?",
    answer:
      "Yes, on the API side. POST /api/sync applies a batch of create, update and delete operations in order and reports accepted, conflicting and rejected operations. GET /api/sync returns changes since a cursor. An offline client app is not included yet.",
  },
  {
    question: "Can I call the API from my own website?",
    answer:
      "Yes. The API sends CORS headers, so a website on another domain can call it from the browser using a Bearer token. Servers, mobile apps and curl work with just the URL and a token.",
  },
  {
    question: "Is there rate limiting?",
    answer:
      "Yes. Register, login and forgot-password are rate limited and return 429 with a Retry-After header when you go over the limit. See the API documentation for the exact limits.",
  },
];

// The product is an HTTP API. This page lists the endpoints and lets you call them from the browser.

const endpoints: { method: string; path: string; note: string }[] = [
  { method: "POST", path: "/api/auth/register", note: "Create an account, returns a JWT" },
  { method: "POST", path: "/api/auth/login", note: "Exchange credentials for a JWT" },
  { method: "POST", path: "/api/auth/forgot-password", note: "Request a password reset email" },
  { method: "POST", path: "/api/auth/reset-password", note: "Set a new password with a reset token" },
  { method: "GET", path: "/api/tasks", note: "List and filter tasks" },
  { method: "POST", path: "/api/tasks", note: "Create a task, idempotent with a key" },
  { method: "PATCH", path: "/api/tasks", note: "Bulk update your own tasks" },
  { method: "DELETE", path: "/api/tasks", note: "Bulk delete your own tasks" },
  { method: "GET", path: "/api/tasks/:id", note: "View one task" },
  { method: "PATCH", path: "/api/tasks/:id", note: "Update one task, version-checked" },
  { method: "DELETE", path: "/api/tasks/:id", note: "Soft-delete one task" },
  { method: "POST", path: "/api/sync", note: "Push offline-originated operations" },
  { method: "GET", path: "/api/sync", note: "Pull changes since a cursor" },
  { method: "GET", path: "/health", note: "Database health check" },
];

export default function Home() {
  return (
    <>
      <header className="glass-nav sticky top-0 z-50 border-b border-black/10">
        <nav aria-label="Main" className="mx-auto flex h-12 max-w-5xl items-center justify-between px-6 text-[13px]">
          <a href="#top" className="text-[15px] font-semibold tracking-tight">Task Manager API</a>
          <ul className="hidden gap-7 text-[#424245] sm:flex">
            <li><a href="#account" className="hover:text-black">Account</a></li>
            <li><a href="#create" className="hover:text-black">Create</a></li>
            <li><a href="#tasks" className="hover:text-black">Tasks</a></li>
            <li><a href="#reset" className="hover:text-black">Reset</a></li>
            <li><a href="#health" className="hover:text-black">Health</a></li>
            <li><a href="#reference" className="hover:text-black">Reference</a></li>
            <li><Link href="/docs" className="hover:text-black">API docs</Link></li>
            <li><Link href="/about" className="hover:text-black">About</Link></li>
          </ul>
        </nav>
      </header>

      <main id="top" className="flex-1">
        <section className="tone-light bg-[var(--bg)] px-6 pb-24 pt-24 text-center sm:pt-32">
          <h1 className="mx-auto max-w-3xl text-5xl font-semibold leading-[1.05] tracking-[-0.04em] text-[var(--fg)] sm:text-7xl">
            Task Manager API: tasks that stay in sync.
          </h1>
          <p className="mx-auto mt-6 max-w-xl text-xl leading-snug text-[var(--mute)] sm:text-2xl">
            A REST API with JWT auth, version-checked edits and offline sync. Built by {site.owner.name} at{" "}
            {site.organization.name} in {placeLabel}. Every endpoint below is live.
          </p>
          <div className="mt-9 flex items-center justify-center gap-6 text-[17px]">
            <a href="#account" className="rounded-full bg-[#0071e3] px-7 py-3 font-medium text-white hover:bg-[#0077ed]">Try it now</a>
            <Link href="/docs" className="text-[#0066cc] hover:underline">Read the API documentation ›</Link>
          </div>

          <div className="tone-dark mx-auto mt-16 max-w-2xl overflow-hidden rounded-[28px] bg-[var(--card)] text-left shadow-2xl shadow-black/20">
            <div className="flex items-center gap-2 px-5 py-4">
              <span className="size-3 rounded-full bg-[#ff5f57]" /><span className="size-3 rounded-full bg-[#febc2e]" /><span className="size-3 rounded-full bg-[#28c840]" />
              <span className="ml-3 font-mono text-[13px] text-[var(--mute)]">201 Created</span>
            </div>
            <pre className="overflow-x-auto px-6 pb-6 font-mono text-[13px] leading-6 text-[var(--fg)] sm:text-sm">{`POST /api/tasks
Authorization: Bearer eyJhbGciOi…

{ "data": {
    "title": "Ship the release",
    "status": "todo",
    "version": 1
} }`}</pre>
          </div>
        </section>

        <section aria-labelledby="features" className="tone-gray bg-[var(--bg)] px-6 py-24 text-[var(--fg)] sm:py-32">
          <div className="mx-auto max-w-5xl">
            <h2 id="features" className="text-center text-4xl font-semibold tracking-[-0.03em] sm:text-5xl">
              What the Task Manager API does.
            </h2>
            <p className="mx-auto mt-4 max-w-2xl text-center text-xl text-[var(--mute)]">
              Everything a task app needs from its backend, tested and documented.
            </p>
            <ul className="mt-14 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {features.map((feature) => (
                <li key={feature.title} className="rounded-[22px] bg-[var(--card)] p-7">
                  <h3 className="text-xl font-semibold tracking-tight">{feature.title}</h3>
                  <p className="mt-3 text-[15px] leading-relaxed text-[var(--mute)]">{feature.text}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <Playground />

        <section id="reference" className="tone-light bg-[var(--bg)] px-6 py-24 text-[var(--fg)] sm:py-32">
          <div className="mx-auto max-w-3xl">
            <h2 className="text-center text-4xl font-semibold tracking-[-0.03em] sm:text-5xl">Every endpoint.</h2>
            <p className="mx-auto mt-4 max-w-xl text-center text-xl text-[var(--mute)]">Everything except auth and health needs a Bearer token.</p>
            <ul className="mt-12 divide-y divide-[var(--line)] border-y border-[var(--line)]">
              {endpoints.map((e) => (
                <li key={`${e.method} ${e.path}`} className="grid grid-cols-[4.5rem_1fr] items-baseline gap-x-4 gap-y-1 py-4 sm:grid-cols-[4.5rem_16rem_1fr]">
                  <span className="font-mono text-[13px] font-semibold text-[#0071e3]">{e.method}</span>
                  <code className="font-mono text-[15px]">{e.path}</code>
                  <span className="col-span-2 text-[15px] text-[var(--mute)] sm:col-span-1">{e.note}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section aria-labelledby="faq" className="tone-gray bg-[var(--bg)] px-6 py-24 text-[var(--fg)] sm:py-32">
          <div className="mx-auto max-w-3xl">
            <h2 id="faq" className="text-center text-4xl font-semibold tracking-[-0.03em] sm:text-5xl">
              Questions, answered.
            </h2>
            <div className="mt-12 divide-y divide-[var(--line)] border-y border-[var(--line)]">
              {faqs.map((faq) => (
                <details key={faq.question} className="group py-5">
                  <summary className="cursor-pointer list-none text-lg font-medium marker:hidden">{faq.question}</summary>
                  <p className="mt-3 text-[16px] leading-relaxed text-[var(--mute)]">{faq.answer}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        <section aria-labelledby="built-by" className="tone-light bg-[var(--bg)] px-6 py-24 text-center text-[var(--fg)] sm:py-28">
          <div className="mx-auto max-w-2xl">
            <h2 id="built-by" className="text-3xl font-semibold tracking-[-0.03em] sm:text-4xl">
              Built by {site.owner.name}, {site.organization.name}.
            </h2>
            <p className="mt-4 text-lg text-[var(--mute)]">
              The Task Manager API is designed, built and maintained by {site.organization.name} in {placeLabel}.
            </p>
            <p className="mt-6 flex flex-wrap items-center justify-center gap-x-8 gap-y-3 text-[17px]">
              <Link href="/about" className="text-[#0066cc] hover:underline">About {site.owner.name} and {site.organization.name} ›</Link>
              <Link href="/docs" className="text-[#0066cc] hover:underline">API documentation ›</Link>
            </p>
          </div>
        </section>
      </main>

      <SiteFooter />
      <JsonLd
        data={graph(
          webPageLd({
            path: "/",
            name: site.title,
            description: site.description,
            type: "WebPage",
            breadcrumbs: false,
          }),
          faqLd(faqs)
        )}
      />
    </>
  );
}

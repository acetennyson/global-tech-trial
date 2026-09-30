import Playground from "./_components/Playground";

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
        <nav className="mx-auto flex h-12 max-w-5xl items-center justify-between px-6 text-[13px]">
          <a href="#top" className="text-[15px] font-semibold tracking-tight">Task Manager API</a>
          <ul className="hidden gap-7 text-[#424245] sm:flex">
            <li><a href="#account" className="hover:text-black">Account</a></li>
            <li><a href="#create" className="hover:text-black">Create</a></li>
            <li><a href="#tasks" className="hover:text-black">Tasks</a></li>
            <li><a href="#reset" className="hover:text-black">Reset</a></li>
            <li><a href="#health" className="hover:text-black">Health</a></li>
            <li><a href="#reference" className="hover:text-black">Reference</a></li>
          </ul>
        </nav>
      </header>

      <main id="top" className="flex-1">
        <section className="tone-light bg-[var(--bg)] px-6 pb-24 pt-24 text-center sm:pt-32">
          <h1 className="mx-auto max-w-3xl text-5xl font-semibold leading-[1.05] tracking-[-0.04em] text-[var(--fg)] sm:text-7xl">
            Tasks that stay in sync.
          </h1>
          <p className="mx-auto mt-6 max-w-xl text-xl leading-snug text-[var(--mute)] sm:text-2xl">
            A REST API with JWT auth, version-checked edits and offline sync. Every endpoint below is live.
          </p>
          <div className="mt-9 flex items-center justify-center gap-6 text-[17px]">
            <a href="#account" className="rounded-full bg-[#0071e3] px-7 py-3 font-medium text-white hover:bg-[#0077ed]">Try it now</a>
            <a href="#reference" className="text-[#0066cc] hover:underline">Endpoint reference ›</a>
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
      </main>

      <footer className="tone-gray bg-[var(--bg)] px-6 py-8 text-center text-xs text-[var(--mute)]">
        Global Tech Task Manager API. Built with Next.js route handlers and Postgres.
      </footer>
    </>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import JsonLd from "../_components/JsonLd";
import { SiteFooter, SiteHeader } from "../_components/SiteChrome";
import { breadcrumbLd, graph, pageMetadata, techArticleLd, webPageLd } from "@/lib/seo";
import { getSiteUrl, site } from "@/lib/site";

const path = "/docs";
const title = "Task Manager API documentation: auth, tasks, sync";
const description =
  "Task Manager REST API docs: JWT auth, tasks with filtering and pagination, version-checked edits, idempotent creates, bulk operations, offline sync and CORS.";

export const metadata: Metadata = pageMetadata({ title: "API documentation", description, path });

const base = getSiteUrl();

const loginExample = `curl -X POST ${base}/api/auth/register \\
  -H "content-type: application/json" \\
  -d '{"email":"ada@example.com","password":"correct horse battery staple","name":"Ada"}'

TOKEN=$(curl -s -X POST ${base}/api/auth/login \\
  -H "content-type: application/json" \\
  -d '{"email":"ada@example.com","password":"correct horse battery staple"}' | jq -r .data.token)`;

const createExample = `curl -X POST ${base}/api/tasks \\
  -H "content-type: application/json" \\
  -H "Authorization: Bearer $TOKEN" \\
  -H "Idempotency-Key: $(uuidgen)" \\
  -d '{"title":"Ship the release","startTime":"2026-01-01T09:00:00Z","endTime":"2026-01-01T17:00:00Z"}'`;

const patchExample = `curl -X PATCH ${base}/api/tasks/<id> \\
  -H "content-type: application/json" \\
  -H "Authorization: Bearer $TOKEN" \\
  -d '{"status":"done","version":3}'`;

const listExample = `curl "${base}/api/tasks?status=todo&sort=-startTime" \\
  -H "Authorization: Bearer $TOKEN"`;

const bulkExample = `curl -X PATCH ${base}/api/tasks \\
  -H "content-type: application/json" -H "Authorization: Bearer $TOKEN" \\
  -d '{"ids":["t1","t2"],"data":{"status":"done"},"versions":{"t1":3}}'`;

const syncExample = `curl -X POST ${base}/api/sync \\
  -H "content-type: application/json" -H "Authorization: Bearer $TOKEN" \\
  -d '{"operations":[{"id":"op-1","operation":"create","entityId":"t1","payload":{...}}]}'

curl "${base}/api/sync?cursor=<cursor>" -H "Authorization: Bearer $TOKEN"`;

const forgotPasswordExample = `curl -X POST ${base}/api/auth/forgot-password \\
  -H "content-type: application/json" \\
  -d '{"email":"ada@example.com"}'
# always 200, whether or not that email is registered

curl -X POST ${base}/api/auth/reset-password \\
  -H "content-type: application/json" \\
  -d '{"token":"<token from the email>","password":"a new strong password"}'`;

const verifyEmailExample = `# resend the verification email if the link expired or never arrived
curl -X POST ${base}/api/auth/resend-verification \\
  -H "content-type: application/json" \\
  -d '{"email":"ada@example.com"}'

# verify with the token from the emailed link
curl -X POST ${base}/api/auth/verify-email \\
  -H "content-type: application/json" \\
  -d '{"token":"<token from the email>"}'
# { data: { user, token } } — a fresh token, no re-login needed

# the emailed link itself is a plain GET, meant to be clicked, not called from code:
# it redirects a browser straight to a confirmation page instead of returning JSON
# GET ${base}/api/auth/verify-email?token=<token from the email>`;

const meExample = `curl "${base}/api/auth/me" -H "Authorization: Bearer $TOKEN"
# { data: { id, email, name, emailVerified, emailVerifiedAt, createdAt } }`;

const newsletterExample = `curl -X POST ${base}/api/newsletter/subscribe \\
  -H "content-type: application/json" \\
  -d '{"email":"ada@example.com"}'
# always 200, whether or not that email was already subscribed`;

const toc = [
  ["overview", "Overview"],
  ["authentication", "Authentication"],
  ["email-verification", "Email verification"],
  ["tasks", "Tasks"],
  ["idempotency", "Idempotent creates"],
  ["versions", "Version-checked edits"],
  ["bulk", "Bulk operations"],
  ["sync", "Offline sync"],
  ["newsletter", "Newsletter"],
  ["rate-limits", "Rate limits"],
  ["cors", "Using the API from a website"],
  ["errors", "Errors and request IDs"],
] as const;

function Code({ children }: { children: string }) {
  return (
    <pre className="mt-4 overflow-x-auto rounded-2xl bg-[#1d1d1f] p-5 text-[13px] leading-6 text-[#f5f5f7]">
      <code>{children}</code>
    </pre>
  );
}

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-h`} className="scroll-mt-20 border-t border-[var(--line)] py-12">
      <h2 id={`${id}-h`} className="text-3xl font-semibold tracking-[-0.02em]">{title}</h2>
      <div className="mt-4 space-y-4 text-[17px] leading-relaxed text-[#424245]">{children}</div>
    </section>
  );
}

export default function DocsPage() {
  return (
    <>
      <SiteHeader />
      <main id="top" className="tone-light flex-1 bg-[var(--bg)] px-6 pb-24 pt-16 text-[var(--fg)]">
        <article className="mx-auto max-w-3xl">
          <nav aria-label="Breadcrumb" className="text-[13px] text-[var(--mute)]">
            <ol className="flex gap-2">
              <li><Link href="/" className="text-[#0066cc] hover:underline">Home</Link></li>
              <li aria-hidden="true">/</li>
              <li aria-current="page">API documentation</li>
            </ol>
          </nav>

          <h1 className="mt-6 text-5xl font-semibold leading-[1.05] tracking-[-0.04em] sm:text-6xl">
            Task Manager API documentation
          </h1>
          <p className="mt-6 text-xl leading-snug text-[var(--mute)]">
            How to authenticate, manage tasks, avoid conflicts and sync offline changes. Every example uses{" "}
            <code className="rounded bg-[var(--code)] px-1.5 py-0.5 text-[15px]">{base}</code> as the base URL.
          </p>

          <nav aria-label="On this page" className="mt-10 rounded-2xl bg-[var(--code)] p-6">
            <p className="text-sm font-semibold uppercase tracking-wide text-[var(--mute)]">On this page</p>
            <ul className="mt-3 grid gap-x-8 gap-y-2 text-[16px] sm:grid-cols-2">
              {toc.map(([id, label]) => (
                <li key={id}><a href={`#${id}`} className="text-[#0066cc] hover:underline">{label}</a></li>
              ))}
            </ul>
          </nav>

          <Section id="overview" title="Overview">
            <p>
              The Task Manager API is a JSON REST API for tasks. Successful responses look like{" "}
              <code>{`{ "data": ... }`}</code> and failures look like <code>{`{ "error": { "message", "details" } }`}</code>.
              Everything except sign-in, registration, password reset and <code>/health</code> needs a Bearer token.
            </p>
            <p>
              It is built by {site.owner.name} at {site.organization.name}. You can try every endpoint from the{" "}
              <Link href="/#account" className="text-[#0066cc] hover:underline">live playground on the home page</Link>.
            </p>
          </Section>

          <Section id="authentication" title="Authentication">
            <p>
              Create an account with <code>POST /api/auth/register</code> (<code>email</code>, <code>password</code> of at
              least 8 characters, optional <code>name</code>) or sign in with <code>POST /api/auth/login</code>. Both return{" "}
              <code>{`{ user, token }`}</code>. Send the token as <code>Authorization: Bearer &lt;token&gt;</code>. A missing,
              bad or expired token returns <code>401</code>.
            </p>
            <Code>{loginExample}</Code>
            <p>
              Forgot a password? <code>POST /api/auth/forgot-password</code> always answers <code>200</code> with the same
              message, so it never reveals which emails are registered. The emailed token is single-use and expires after one
              hour. Finish with <code>POST /api/auth/reset-password</code> and <code>{`{ token, password }`}</code>.
            </p>
            <Code>{forgotPasswordExample}</Code>
          </Section>

          <Section id="email-verification" title="Email verification">
            <p>
              Registering sends a verification email. You can sign in and read right away with an unverified account, but
              creating, editing, deleting or syncing tasks needs a verified email first (<code>403</code> otherwise). The
              check runs fresh on every request, so verifying takes effect immediately with no re-login required.
            </p>
            <p>
              The emailed link is a plain <code>GET /api/auth/verify-email?token=...</code>, meant to be clicked: it verifies
              the account and redirects to a confirmation page. <code>POST /api/auth/verify-email</code> with{" "}
              <code>{`{ token }`}</code> is the same check for a client that already has the raw token and wants a fresh,
              verified JWT back directly, as <code>{`{ user, token }`}</code>. Lost or expired the email?{" "}
              <code>POST /api/auth/resend-verification</code> with <code>{`{ email }`}</code> sends a new one, answering{" "}
              <code>200</code> either way so it never reveals whether that email is registered or already verified. Neither
              verify-email route is rate-limited: the token is 256 random bits and single-use, so limiting by IP or email
              would only let an attacker lock out the real owner.
            </p>
            <Code>{verifyEmailExample}</Code>
            <p>
              <code>GET /api/auth/me</code> (auth required) returns the caller&apos;s own profile, including{" "}
              <code>emailVerified</code> and <code>emailVerifiedAt</code>, so a client can check status without decoding its
              token or re-logging in.
            </p>
            <Code>{meExample}</Code>
          </Section>

          <Section id="tasks" title="Tasks">
            <p>
              <code>POST /api/tasks</code> creates a task. Required: <code>title</code>, <code>startTime</code>,{" "}
              <code>endTime</code> (not before the start). Optional: <code>description</code>, <code>parentId</code>,{" "}
              <code>status</code> (<code>todo</code>, <code>inProgress</code> or <code>done</code>), <code>visible</code>.
            </p>
            <Code>{createExample}</Code>
            <p>
              <code>GET /api/tasks</code> lists your tasks plus everyone&apos;s visible ones. Filter with <code>status</code>,{" "}
              <code>creator</code>, <code>parentId</code>, <code>visible</code>, <code>search</code> and a time range, and sort
              with <code>sort=-startTime</code>. Paginate with <code>offset</code> for numbered pages or <code>cursor</code> for
              fast keyset pagination on large lists.
            </p>
            <Code>{listExample}</Code>
            <p>
              <code>GET /api/tasks/:id</code> returns one task (<code>404</code> if it is missing, deleted or hidden from you).{" "}
              <code>DELETE /api/tasks/:id</code> is a soft delete. Only the creator can edit or delete a task (<code>403</code>).
            </p>
          </Section>

          <Section id="idempotency" title="Idempotent creates">
            <p>
              Add an <code>Idempotency-Key</code> header to a create. If the connection drops and you resend the request with
              the same key, you get the original task back (<code>200</code>, not <code>201</code>) instead of a duplicate.
              Keys belong to the user, and a key is tied to its first request: the same key with a different body returns{" "}
              <code>422</code>.
            </p>
          </Section>

          <Section id="versions" title="Version-checked edits">
            <p>
              Every task has a <code>version</code>. <code>PATCH /api/tasks/:id</code> takes any subset of the create fields
              plus the version you last saw. If someone else changed the task in the meantime, you get <code>409</code> with
              the current task in <code>error.details.current</code>, so the first edit is never overwritten.
            </p>
            <Code>{patchExample}</Code>
          </Section>

          <Section id="bulk" title="Bulk operations">
            <p>
              <code>PATCH /api/tasks</code> and <code>DELETE /api/tasks</code> change many of your tasks at once. They are
              all-or-nothing: every id must be a live task you created, or nothing changes (<code>404</code> for an unknown
              id, <code>403</code> for someone else&apos;s task). Bulk update accepts an optional <code>versions</code> map for
              per-task version checks and returns <code>409</code> if any listed task has moved on. Use{" "}
              <code>{`{"all":true}`}</code> to delete all of your own tasks.
            </p>
            <Code>{bulkExample}</Code>
          </Section>

          <Section id="sync" title="Offline sync">
            <p>
              <code>POST /api/sync</code> pushes a batch of <code>create</code>, <code>update</code> and <code>delete</code>{" "}
              operations, applied in order. Each operation&apos;s <code>id</code> is its idempotency key, so resending a batch
              after a lost response re-applies nothing. The response lists <code>accepted</code>, <code>conflicts</code>{" "}
              (stale version, fix and resubmit) and <code>rejected</code> operations (permanent ones should not be retried).
            </p>
            <p>
              <code>GET /api/sync?cursor=...</code> returns everything that changed since a cursor, including deletes, which
              is how a deleted task reaches a device that still holds the old copy. This is the API side of an offline-first
              app. An offline client is not included yet.
            </p>
            <Code>{syncExample}</Code>
          </Section>

          <Section id="newsletter" title="Newsletter">
            <p>
              <code>POST /api/newsletter/subscribe</code> with <code>{`{ email }`}</code> adds an address to the mailing
              list. Like <code>forgot-password</code>, it always answers <code>200</code> with the same message, so it never
              reveals who is already subscribed. Every newsletter email includes a one-click unsubscribe link (
              <code>GET /api/newsletter/unsubscribe?token=...</code>) built from a single-use token, no login required.
            </p>
            <Code>{newsletterExample}</Code>
          </Section>

          <Section id="rate-limits" title="Rate limits">
            <p>Over a limit you get <code>429</code> with a <code>Retry-After</code> header.</p>
            <ul className="list-disc space-y-2 pl-6">
              <li><code>register</code>: 5 per hour per IP address.</li>
              <li><code>login</code>: 5 failed attempts per 15 minutes per email and IP, and 30 per 15 minutes per IP. Only failed logins count.</li>
              <li><code>forgot-password</code>: 10 per hour per IP (<code>429</code>) and 3 per hour per email, which still answers <code>200</code> but sends nothing.</li>
              <li><code>resend-verification</code>: 10 per hour per IP and 3 per hour per account, so a client can&apos;t spam a user&apos;s inbox with verification emails.</li>
              <li><code>newsletter/subscribe</code>: 10 per hour per IP.</li>
              <li><code>auth/me</code>: 60 per minute per account.</li>
            </ul>
          </Section>

          <Section id="cors" title="Using the API from a website">
            <p>
              Servers, mobile apps and <code>curl</code> only need the URL and a token. Websites on other domains can call the
              API from the browser too: it answers the CORS preflight check and allows the{" "}
              <code>Authorization</code>, <code>Content-Type</code>, <code>Idempotency-Key</code> and{" "}
              <code>X-Request-Id</code> headers. Browser code can read <code>X-Request-Id</code> and{" "}
              <code>Retry-After</code> from responses. Auth is a Bearer token and never a cookie.
            </p>
          </Section>

          <Section id="errors" title="Errors and request IDs">
            <p>
              Every response carries an <code>X-Request-Id</code> header. Quote it when you report a problem and it can be
              traced through the logs. <code>GET /health</code> runs a database check and returns <code>200</code>, or{" "}
              <code>503</code> if the database is down or slow.
            </p>
            <p>
              Common statuses: <code>400</code> invalid input, <code>401</code> no or bad token, <code>403</code> not the
              creator, <code>404</code> not found or hidden, <code>409</code> version conflict, <code>422</code> reused
              idempotency key with a different body, <code>429</code> rate limited.
            </p>
          </Section>

          <p className="border-t border-[var(--line)] pt-10 text-[17px] text-[var(--mute)]">
            {/* Built by <Link href="/about" className="text-[#0066cc] hover:underline">{site.owner.name} at {site.organization.name}</Link>. */}
            Ready to try it? <Link href="/#account" className="text-[#0066cc] hover:underline">Open the live playground</Link>.
          </p>
        </article>
      </main>
      <SiteFooter />
      <JsonLd
        data={graph(
          webPageLd({ path, name: title, description, type: "WebPage" }),
          techArticleLd({ path, headline: title, description }),
          breadcrumbLd([
            { name: "Home", path: "/" },
            { name: "API documentation", path },
          ])
        )}
      />
    </>
  );
}

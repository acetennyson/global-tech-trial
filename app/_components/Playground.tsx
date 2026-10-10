"use client";

import { useState, useSyncExternalStore, type ReactNode } from "react";

/* ---------- request plumbing ---------- */

type Call = { method: string; path: string; status: number; ms: number; body: unknown };

async function api(method: string, path: string, token: string | null, payload?: unknown, extraHeaders?: Record<string, string>): Promise<Call> {
  const t0 = performance.now();
  const headers: Record<string, string> = { ...extraHeaders };
  if (payload !== undefined) headers["content-type"] = "application/json";
  if (token) headers.authorization = `Bearer ${token}`;
  try {
    const res = await fetch(path, {
      method,
      headers,
      body: payload !== undefined ? JSON.stringify(payload) : undefined,
    });
    const body = await res.json().catch(() => null);
    return { method, path, status: res.status, ms: Math.round(performance.now() - t0), body };
  } catch {
    return { method, path, status: 0, ms: Math.round(performance.now() - t0), body: { error: { message: "Network error" } } };
  }
}

function useCall(token: string | null) {
  const [result, setResult] = useState<Call | null>(null);
  const [loading, setLoading] = useState(false);
  async function run(method: string, path: string, payload?: unknown, extraHeaders?: Record<string, string>) {
    setLoading(true);
    const r = await api(method, path, token, payload, extraHeaders);
    setResult(r);
    setLoading(false);
    return r;
  }
  return { result, loading, run };
}

/* ---------- shared UI ---------- */

const inputCls =
  "h-12 w-full rounded-xl border border-[var(--line)] bg-[var(--field)] px-4 text-[17px] text-[var(--fg)] placeholder:text-[var(--mute)] transition-colors focus:border-[#0071e3] focus:outline-none focus:ring-4 focus:ring-[#0071e3]/25";

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-[var(--mute)]">{label}</span>
      {children}
    </label>
  );
}

function Button({ children, loading, ...rest }: { children: ReactNode; loading?: boolean } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...rest}
      disabled={loading || rest.disabled}
      className="inline-flex h-12 items-center justify-center rounded-full bg-[#0071e3] px-7 text-[17px] font-medium text-white transition-colors hover:bg-[#0077ed] active:bg-[#006edb] disabled:opacity-60"
    >
      {loading ? "Sending…" : children}
    </button>
  );
}

function Segmented<T extends string>({ value, options, onChange }: { value: T; options: { id: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div role="tablist" className="inline-flex rounded-full bg-[var(--code)] p-1 ring-1 ring-[var(--line)]">
      {options.map((o) => (
        <button
          key={o.id}
          role="tab"
          aria-selected={value === o.id}
          onClick={() => onChange(o.id)}
          className={`h-9 rounded-full px-5 text-[15px] font-medium transition-colors ${
            value === o.id ? "bg-[var(--card)] text-[var(--fg)] shadow-sm" : "text-[var(--mute)] hover:text-[var(--fg)]"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function ResultPanel({ call, loading }: { call: Call | null; loading: boolean }) {
  const okStatus = call && call.status >= 200 && call.status < 300;
  return (
    <div className="flex min-h-[320px] flex-col overflow-hidden rounded-2xl bg-[var(--code)] ring-1 ring-[var(--line)]" aria-live="polite">
      <div className="flex items-center justify-between gap-3 border-b border-[var(--line)] px-4 py-3">
        <span className="truncate font-mono text-[13px] text-[var(--mute)]">
          {call ? `${call.method} ${call.path}` : "Response"}
        </span>
        {call && (
          <span className="flex shrink-0 items-center gap-2 text-[13px] text-[var(--mute)]">
            <span className={`rounded-full px-2.5 py-0.5 font-semibold ${okStatus ? "bg-[#34c759]/20 text-[#248a3d]" : "bg-[#ff3b30]/15 text-[#d70015]"}`}>
              {call.status || "ERR"}
            </span>
            {call.ms} ms
          </span>
        )}
      </div>
      <pre className={`flex-1 overflow-auto p-4 font-mono text-[13px] leading-6 text-[var(--fg)] transition-opacity ${loading ? "opacity-40" : ""}`}>
        {call ? JSON.stringify(call.body, null, 2) : "Run the request to see the response here."}
      </pre>
    </div>
  );
}

function Section({ id, tone, title, sub, children }: { id: string; tone: "light" | "gray" | "dark"; title: string; sub: string; children: ReactNode }) {
  return (
    <section id={id} className={`tone-${tone} bg-[var(--bg)] px-6 py-24 text-[var(--fg)] sm:py-32`}>
      <div className="mx-auto max-w-5xl">
        <h2 className="mx-auto max-w-2xl text-center text-4xl font-semibold tracking-[-0.03em] sm:text-5xl">{title}</h2>
        <p className="mx-auto mt-4 max-w-xl text-center text-xl leading-snug text-[var(--mute)]">{sub}</p>
        <div className="mt-14 grid gap-6 lg:grid-cols-2">{children}</div>
      </div>
    </section>
  );
}

function FormCard({ children }: { children: ReactNode }) {
  return <div className="flex flex-col gap-5 rounded-[28px] bg-[var(--card)] p-7 ring-1 ring-[var(--line)] sm:p-8">{children}</div>;
}

const toIso = (local: string) => (local ? new Date(local).toISOString() : "");
const toLocalInput = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);

/* ---------- sections ---------- */

function Account({ token, onAuth }: { token: string | null; onAuth: (t: string | null, who: string | null) => void }) {
  const [mode, setMode] = useState<"register" | "login">("register");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const { result, loading, run } = useCall(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const payload = mode === "register" ? { email, password, ...(name.trim() ? { name } : {}) } : { email, password };
    const r = await run("POST", `/api/auth/${mode}`, payload);
    const data = (r.body as { data?: { token?: string; user?: { email: string } } } | null)?.data;
    if (data?.token) onAuth(data.token, data.user?.email ?? email);
  }

  return (
    <Section
      id="account"
      tone="dark"
      title="Start with an account."
      sub={
        mode === "register"
          ? "Register or sign in. The token you get back is used automatically for every request below. A new account can sign in and read right away, but creating, editing, deleting, or syncing tasks needs a verified email first — see “Verify your email” below."
          : "Register or sign in. The token you get back is used automatically for every request below."
      }
    >
      <FormCard>
        <Segmented value={mode} onChange={setMode} options={[{ id: "register", label: "Register" }, { id: "login", label: "Sign in" }]} />
        <form onSubmit={submit} className="flex flex-col gap-4">
          <Field label="Email"><input className={inputCls} type="email" autoComplete="email" placeholder="ada@example.com" value={email} onChange={(e) => setEmail(e.target.value)} required /></Field>
          <Field label="Password"><input className={inputCls} type="password" autoComplete={mode === "register" ? "new-password" : "current-password"} placeholder="At least 8 characters" value={password} onChange={(e) => setPassword(e.target.value)} required /></Field>
          {mode === "register" && <Field label="Name (optional)"><input className={inputCls} placeholder="Ada" value={name} onChange={(e) => setName(e.target.value)} /></Field>}
          <div className="flex items-center gap-4 pt-1">
            <Button type="submit" loading={loading}>{mode === "register" ? "Create account" : "Sign in"}</Button>
            {token && (
              <button type="button" onClick={() => onAuth(null, null)} className="text-[15px] text-[#2997ff] hover:underline">Sign out</button>
            )}
          </div>
        </form>
      </FormCard>
      <ResultPanel call={result} loading={loading} />
    </Section>
  );
}

// false during server render and hydration, true once on the client. Lets us read the
// browser clock for default dates without setState-in-effect or a hydration mismatch.
const subscribeNoop = () => () => {};
function useIsClient() {
  return useSyncExternalStore(subscribeNoop, () => true, () => false);
}

function CreateTaskForm({ token, verified }: { token: string | null; verified: boolean | null }) {
  const [title, setTitle] = useState("Ship the release");
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState<"todo" | "inProgress" | "done">("todo");
  const [visible, setVisible] = useState(true);
  const [start, setStart] = useState(() => toLocalInput(new Date()));
  const [end, setEnd] = useState(() => toLocalInput(new Date(new Date().getTime() + 3600_000)));
  const { result, loading, run } = useCall(token);

  // One key per "attempt". Pressing Create again without changing anything replays the
  // same key, so the API returns the original task (200) instead of a duplicate (201).
  // The key is renewed once a task is actually created.
  const [idemKey, setIdemKey] = useState(() => crypto.randomUUID());

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const r = await run(
      "POST",
      "/api/tasks",
      {
        title, status, visible,
        ...(description.trim() ? { description } : {}),
        startTime: toIso(start), endTime: toIso(end),
      },
      { "idempotency-key": idemKey }
    );
    if (r.status === 201) setIdemKey(crypto.randomUUID());
  }

  return (
    <>
      <FormCard>
        <form onSubmit={submit} className="flex flex-col gap-4">
          <Field label="Title"><input className={inputCls} value={title} onChange={(e) => setTitle(e.target.value)} required /></Field>
          <Field label="Description"><textarea className={`${inputCls} h-24 resize-none py-3`} value={description} onChange={(e) => setDescription(e.target.value)} /></Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Starts"><input className={inputCls} type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} required /></Field>
            <Field label="Ends"><input className={inputCls} type="datetime-local" value={end} onChange={(e) => setEnd(e.target.value)} required /></Field>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-4">
            <Segmented value={status} onChange={setStatus} options={[{ id: "todo", label: "To do" }, { id: "inProgress", label: "In progress" }, { id: "done", label: "Done" }]} />
            <label className="flex items-center gap-2 text-[15px] text-[var(--mute)]">
              <input type="checkbox" checked={visible} onChange={(e) => setVisible(e.target.checked)} className="size-5 accent-[#0071e3]" />
              Visible to others
            </label>
          </div>
          <div className="pt-1"><Button type="submit" loading={loading}>Create task</Button></div>
          {!token && <p className="text-sm text-[var(--mute)]">Not signed in yet. Running this will show the 401 the API returns.</p>}
          {token && verified === false && (
            <p className="text-sm text-[var(--mute)]">
              Signed in but not verified. Running this will show the 403 the API returns — see “Verify your email” below.
            </p>
          )}
        </form>
      </FormCard>
      <ResultPanel call={result} loading={loading} />
    </>
  );
}

function CreateTask({ token, verified }: { token: string | null; verified: boolean | null }) {
  const isClient = useIsClient();
  return (
    <Section id="create" tone="light" title="Create a task." sub="Times are validated, the creator comes from your token, and a retry never makes a duplicate. Needs a verified email.">
      {isClient ? <CreateTaskForm token={token} verified={verified} /> : <div className="min-h-[520px] rounded-[28px] bg-[var(--card)] ring-1 ring-[var(--line)] lg:col-span-2" />}
    </Section>
  );
}

type TaskRow = { id: string; title: string; status: string; version: number; startTime: string };

function Tasks({ token }: { token: string | null }) {
  const [status, setStatus] = useState("");
  const [limit, setLimit] = useState("5");
  const [tasks, setTasks] = useState<TaskRow[]>([]);
  const { result, loading, run } = useCall(token);

  async function list() {
    const qs = new URLSearchParams({ limit });
    if (status) qs.set("status", status);
    const r = await run("GET", `/api/tasks?${qs}`);
    setTasks((r.body as { data?: { items?: TaskRow[] } } | null)?.data?.items ?? []);
  }

  async function complete(t: TaskRow) {
    await run("PATCH", `/api/tasks/${encodeURIComponent(t.id)}`, { version: t.version, status: "done" });
    await list();
  }
  async function remove(t: TaskRow) {
    await run("DELETE", `/api/tasks/${encodeURIComponent(t.id)}`);
    await list();
  }

  return (
    <Section id="tasks" tone="gray" title="Read, update, delete." sub="Marking done sends the version you last saw. If someone else changed the task first, you get a 409 instead of a silent overwrite.">
      <FormCard>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Status">
            <select className={inputCls} value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="">Any</option><option value="todo">To do</option><option value="inProgress">In progress</option><option value="done">Done</option>
            </select>
          </Field>
          <Field label="Limit"><input className={inputCls} type="number" min={1} max={100} value={limit} onChange={(e) => setLimit(e.target.value)} /></Field>
        </div>
        <div><Button type="button" onClick={list} loading={loading}>List tasks</Button></div>
        {tasks.length > 0 && (
          <ul className="divide-y divide-[var(--line)] rounded-2xl ring-1 ring-[var(--line)]">
            {tasks.map((t) => (
              <li key={t.id} className="flex items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <p className="truncate text-[17px] font-medium">{t.title}</p>
                  <p className="text-sm text-[var(--mute)]">{t.status} · v{t.version}</p>
                </div>
                <div className="flex shrink-0 gap-4 text-[15px]">
                  {t.status !== "done" && <button onClick={() => complete(t)} className="text-[#0071e3] hover:underline">Complete</button>}
                  <button onClick={() => remove(t)} className="text-[#d70015] hover:underline">Delete</button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </FormCard>
      <ResultPanel call={result} loading={loading} />
    </Section>
  );
}

function ResetPassword() {
  const [email, setEmail] = useState("");
  const [token, setToken] = useState("");
  const [password, setPassword] = useState("");
  const { result, loading, run } = useCall(null); // one panel shows whichever request ran last

  return (
    <Section id="reset" tone="light" title="Forgot your password?" sub="Request a reset email, then paste the token from its link (the part after ?token=) to set a new password. Tokens are single-use and expire.">
      <FormCard>
        <form onSubmit={(e) => { e.preventDefault(); run("POST", "/api/auth/forgot-password", { email }); }} className="flex flex-col gap-4">
          <Field label="Email"><input className={inputCls} type="email" autoComplete="email" placeholder="ada@example.com" value={email} onChange={(e) => setEmail(e.target.value)} required /></Field>
          <div><Button type="submit" loading={loading}>Send reset email</Button></div>
        </form>
        <hr className="border-[var(--line)]" />
        <form onSubmit={(e) => { e.preventDefault(); run("POST", "/api/auth/reset-password", { token, password }); }} className="flex flex-col gap-4">
          <Field label="Reset token"><input className={inputCls} placeholder="Paste token from the email link" value={token} onChange={(e) => setToken(e.target.value)} required /></Field>
          <Field label="New password"><input className={inputCls} type="password" autoComplete="new-password" placeholder="At least 8 characters" value={password} onChange={(e) => setPassword(e.target.value)} required /></Field>
          <div><Button type="submit" loading={loading}>Set new password</Button></div>
        </form>
      </FormCard>
      <ResultPanel call={result} loading={loading} />
    </Section>
  );
}

function VerifyEmail({
  token,
  verified,
  onVerified,
  onAuth,
}: {
  token: string | null;
  verified: boolean | null;
  onVerified: (v: boolean) => void;
  onAuth: (t: string | null, who: string | null) => void;
}) {
  const [resendEmail, setResendEmail] = useState("");
  const [verifyToken, setVerifyToken] = useState("");
  const { result, loading, run } = useCall(token); // only /me actually needs it; harmless on the others

  async function resend(e: React.FormEvent) {
    e.preventDefault();
    await run("POST", "/api/auth/resend-verification", { email: resendEmail });
  }

  async function verify(e: React.FormEvent) {
    e.preventDefault();
    const r = await run("POST", "/api/auth/verify-email", { token: verifyToken });
    const data = (r.body as { data?: { token?: string; user?: { email: string } } } | null)?.data;
    if (data?.token) {
      onAuth(data.token, data.user?.email ?? null); // the fresh token this returns, swapped in automatically
      onVerified(true);
    }
  }

  async function check() {
    const r = await run("GET", "/api/auth/me");
    const data = (r.body as { data?: { emailVerified?: boolean } } | null)?.data;
    if (typeof data?.emailVerified === "boolean") onVerified(data.emailVerified);
  }

  return (
    <Section
      id="verify"
      tone="gray"
      title="Verify your email."
      sub="Registering sends a verification email with a link. Paste the token from that link below, or request a new one. Verifying takes effect immediately, on your very next request — no need to sign in again."
    >
      <FormCard>
        <form onSubmit={resend} className="flex flex-col gap-4">
          <Field label="Email"><input className={inputCls} type="email" autoComplete="email" placeholder="ada@example.com" value={resendEmail} onChange={(e) => setResendEmail(e.target.value)} required /></Field>
          <div><Button type="submit" loading={loading}>Resend verification email</Button></div>
        </form>
        <hr className="border-[var(--line)]" />
        <form onSubmit={verify} className="flex flex-col gap-4">
          <Field label="Verification token"><input className={inputCls} placeholder="Paste token from the email link" value={verifyToken} onChange={(e) => setVerifyToken(e.target.value)} required /></Field>
          <div><Button type="submit" loading={loading}>Verify</Button></div>
        </form>
        <hr className="border-[var(--line)]" />
        <div className="flex items-center justify-between gap-4">
          <p className="text-sm text-[var(--mute)]">
            {token ? (verified === null ? "Check your current account's status." : verified ? "Your signed-in account is verified." : "Your signed-in account is not verified yet.") : "Sign in above first."}
          </p>
          <Button type="button" onClick={check} loading={loading} disabled={!token}>Check my account</Button>
        </div>
      </FormCard>
      <ResultPanel call={result} loading={loading} />
    </Section>
  );
}

function Health() {
  const { result, loading, run } = useCall(null);
  return (
    <Section id="health" tone="dark" title="Is it up?" sub="A single call that runs SELECT 1 against the database. No token needed.">
      <FormCard>
        <p className="text-[17px] leading-relaxed text-[var(--mute)]">Useful for load balancers, uptime monitors and a quick sanity check after a deploy.</p>
        <div><Button type="button" onClick={() => run("GET", "/health")} loading={loading}>Check health</Button></div>
      </FormCard>
      <ResultPanel call={result} loading={loading} />
    </Section>
  );
}

/* ---------- entry ---------- */

export default function Playground() {
  const [token, setToken] = useState<string | null>(null);
  const [who, setWho] = useState<string | null>(null);
  // null = unknown yet (not signed in, or haven't checked). Refreshed on every sign-in via
  // GET /api/auth/me, and by "Verify" below the moment it succeeds, so the badge never lies.
  const [verified, setVerified] = useState<boolean | null>(null);

  async function handleAuth(t: string | null, w: string | null) {
    setToken(t);
    setWho(w);
    if (!t) {
      setVerified(null);
      return;
    }
    const res = await fetch("/api/auth/me", { headers: { authorization: `Bearer ${t}` } });
    const body = await res.json().catch(() => null);
    setVerified(typeof body?.data?.emailVerified === "boolean" ? body.data.emailVerified : null);
  }

  return (
    <>
      <div className="fixed right-4 top-14 z-40 flex flex-col items-end gap-1.5" aria-live="polite">
        {token && (
          <span className="rounded-full bg-[#34c759]/15 px-3.5 py-1.5 text-sm font-medium text-[#248a3d] ring-1 ring-[#34c759]/30 backdrop-blur">
            Signed in{who ? ` as ${who}` : ""}
          </span>
        )}
        {token && verified === false && (
          <span className="rounded-full bg-[#ff9500]/15 px-3.5 py-1.5 text-sm font-medium text-[#9a6700] ring-1 ring-[#ff9500]/30 backdrop-blur">
            Email not verified
          </span>
        )}
      </div>
      <Account token={token} onAuth={handleAuth} />
      <CreateTask token={token} verified={verified} />
      <Tasks token={token} />
      <VerifyEmail token={token} verified={verified} onVerified={setVerified} onAuth={handleAuth} />
      <ResetPassword />
      <Health />
    </>
  );
}

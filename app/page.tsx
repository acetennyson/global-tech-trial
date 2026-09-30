// The product is an HTTP API; there is no UI layer. This page just says so and
// points at the entry points, instead of shipping the create-next-app starter.

const endpoints: { method: string; path: string; note: string }[] = [
  { method: "POST", path: "/api/auth/register", note: "create an account, returns a JWT" },
  { method: "POST", path: "/api/auth/login", note: "exchange credentials for a JWT" },
  { method: "POST", path: "/api/auth/forgot-password", note: "request a password reset email" },
  { method: "POST", path: "/api/auth/reset-password", note: "set a new password with a reset token" },
  { method: "GET", path: "/api/tasks", note: "list and filter tasks (auth)" },
  { method: "POST", path: "/api/tasks", note: "create a task (auth)" },
  { method: "PATCH", path: "/api/tasks", note: "bulk update your own tasks (auth)" },
  { method: "DELETE", path: "/api/tasks", note: "bulk delete your own tasks (auth)" },
  { method: "GET", path: "/api/tasks/:id", note: "view one task (auth)" },
  { method: "PATCH", path: "/api/tasks/:id", note: "update one task, version-checked (auth)" },
  { method: "DELETE", path: "/api/tasks/:id", note: "soft-delete one task (auth)" },
  { method: "POST", path: "/api/sync", note: "push offline-originated operations (auth)" },
  { method: "GET", path: "/api/sync", note: "pull changes since a cursor (auth)" },
  { method: "GET", path: "/health", note: "database health check" },
];

export default function Home() {
  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-16 font-sans">
      <h1 className="text-3xl font-semibold tracking-tight">Global Tech Task Manager API</h1>
      <p className="mt-3 text-zinc-600 dark:text-zinc-400">
        This service is a REST API with no browser UI. Authenticated routes expect an{" "}
        <code className="font-mono text-sm">Authorization: Bearer &lt;token&gt;</code> header.
        See the README for request and response details.
      </p>
      <ul className="mt-8 divide-y divide-zinc-200 dark:divide-zinc-800">
        {endpoints.map((e) => (
          <li key={`${e.method} ${e.path}`} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 py-2">
            <span className="w-16 font-mono text-xs font-semibold">{e.method}</span>
            <code className="font-mono text-sm">{e.path}</code>
            <span className="text-sm text-zinc-500">{e.note}</span>
          </li>
        ))}
      </ul>
    </main>
  );
}

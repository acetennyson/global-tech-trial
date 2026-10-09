"use client";

import { useId, useState } from "react";

type Status = "idle" | "loading" | "success" | "error";

// A single pill-shaped email field with an inline arrow button, the way Apple's own
// footer newsletter signup reads: quiet until focused, one line, no modal, no page nav.
export default function NewsletterForm() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [message, setMessage] = useState<string | null>(null);
  const inputId = useId();
  const statusId = useId();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (status === "loading") return;
    setStatus("loading");
    setMessage(null);

    try {
      const res = await fetch("/api/newsletter/subscribe", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const body = await res.json().catch(() => null);

      if (!res.ok) {
        setStatus("error");
        setMessage(body?.error?.message || "Something went wrong. Please try again.");
        return;
      }

      setStatus("success");
      setMessage(body?.data?.message || "You're subscribed.");
      setEmail("");
    } catch {
      setStatus("error");
      setMessage("Something went wrong. Please try again.");
    }
  }

  return (
    <div className="mx-auto mb-10 max-w-sm">
      <label htmlFor={inputId} className="mb-3 block text-[13px] font-medium text-[var(--fg)]">
        Get news about the Task Manager API
      </label>
      <form onSubmit={handleSubmit} className="flex items-center gap-2" noValidate>
        <input
          id={inputId}
          type="email"
          required
          placeholder="Email address"
          value={email}
          disabled={status === "loading"}
          onChange={(e) => setEmail(e.target.value)}
          aria-describedby={message ? statusId : undefined}
          className="h-10 flex-1 rounded-full border border-black/10 bg-white px-4 text-[14px] text-[var(--fg)] outline-none placeholder:text-[var(--mute)] focus:border-[#0071e3] focus:ring-2 focus:ring-[#0071e3]/20 disabled:opacity-60"
        />
        <button
          type="submit"
          disabled={status === "loading"}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#0071e3] text-white transition-opacity hover:opacity-90 disabled:opacity-60"
          aria-label="Subscribe"
        >
          {status === "loading" ? (
            <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/40 border-t-white" />
          ) : (
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path d="M1 8h13M8 1l6 7-6 7" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          )}
        </button>
      </form>
      <p id={statusId} role="status" className={`mt-2 min-h-[1em] text-[12px] ${status === "error" ? "text-[#c0392b]" : "text-[var(--mute)]"}`}>
        {message ?? "No spam. Unsubscribe anytime from a link in every email."}
      </p>
    </div>
  );
}

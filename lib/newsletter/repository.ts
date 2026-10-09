import type { QueryResultRow } from "pg";
import { randomBytes, createHash } from "node:crypto";
import { advanceInsert, advanceSelect, advanceUpdate } from "@/lib/db/advanceSQL";
import { generateId } from "@/lib/db/id";

const TABLE = "newsletter_subscribers";

// Same shape as lib/auth/resetToken.ts: the raw token goes in the unsubscribe link,
// only its hash is stored, so a database leak doesn't hand out working unsubscribe links.
export function generateUnsubscribeToken(): { token: string; tokenHash: string } {
  const token = randomBytes(32).toString("hex");
  return { token, tokenHash: hashUnsubscribeToken(token) };
}

export function hashUnsubscribeToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

interface SubscriberRow extends QueryResultRow {
  id: string;
  email: string;
  unsubscribe_token_hash: string;
  subscribed_at: string;
  unsubscribed_at: string | null;
}

export interface Subscriber {
  id: string;
  email: string;
  unsubscribeTokenHash: string;
  subscribedAt: string;
  unsubscribedAt: string | null;
}

function rowToSubscriber(row: SubscriberRow): Subscriber {
  return {
    id: row.id,
    email: row.email,
    unsubscribeTokenHash: row.unsubscribe_token_hash,
    subscribedAt: String(row.subscribed_at),
    unsubscribedAt: row.unsubscribed_at === null ? null : String(row.unsubscribed_at),
  };
}

export async function findSubscriberByEmail(email: string): Promise<Subscriber | null> {
  const rows = await advanceSelect<SubscriberRow>(TABLE, "*", { email: email.toLowerCase() });
  return rows[0] ? rowToSubscriber(rows[0]) : null;
}

export type SubscribeResult = { status: "subscribed"; token: string } | { status: "already_subscribed" };

/**
 * Inserts a new subscriber, or, if the email unsubscribed before, re-subscribes it with a
 * fresh unsubscribe token. An already-active subscriber is left untouched (idempotent
 * resubmission of the same form shouldn't rotate their unsubscribe link).
 */
export async function subscribe(email: string): Promise<SubscribeResult> {
  const normalized = email.toLowerCase();
  const existing = await findSubscriberByEmail(normalized);
  const { token, tokenHash } = generateUnsubscribeToken();

  if (!existing) {
    await advanceInsert(TABLE, {
      id: generateId(),
      email: normalized,
      unsubscribe_token_hash: tokenHash,
    });
    return { status: "subscribed", token };
  }

  if (existing.unsubscribedAt === null) {
    return { status: "already_subscribed" };
  }

  await advanceUpdate(
    TABLE,
    { unsubscribe_token_hash: tokenHash, subscribed_at: new Date().toISOString(), unsubscribed_at: null },
    { id: existing.id }
  );
  return { status: "subscribed", token };
}

export type UnsubscribeResult = "ok" | "invalid_token" | "already_unsubscribed";

export async function unsubscribeByTokenHash(tokenHash: string): Promise<UnsubscribeResult> {
  const rows = await advanceSelect<SubscriberRow>(TABLE, "*", { unsubscribe_token_hash: tokenHash });
  const row = rows[0];
  if (!row) return "invalid_token";
  if (row.unsubscribed_at !== null) return "already_unsubscribed";

  await advanceUpdate(TABLE, { unsubscribed_at: new Date().toISOString() }, { id: row.id });
  return "ok";
}

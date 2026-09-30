import type { QueryResultRow } from "pg";
import { advanceInsert, advanceSelect, advanceUpdate } from "@/lib/db/advanceSQL";
import { generateId } from "@/lib/db/id";

const TABLE = "users";

export interface User {
  id: string;
  email: string;
  passwordHash: string;
  name: string | null;
  createdAt: string;
}

interface UserRow {
  id: string;
  email: string;
  password_hash: string;
  name: string | null;
  created_at: string;
}

type UserRowPacket = UserRow & QueryResultRow;

function rowToUser(row: UserRow): User {
  return {
    id: row.id,
    email: row.email,
    passwordHash: row.password_hash,
    name: row.name,
    createdAt: String(row.created_at),
  };
}

export async function findUserByEmail(email: string): Promise<User | null> {
  const rows = await advanceSelect<UserRowPacket>(TABLE, "*", { email: email.toLowerCase() });
  return rows[0] ? rowToUser(rows[0]) : null;
}

export async function findUserById(id: string): Promise<User | null> {
  const rows = await advanceSelect<UserRowPacket>(TABLE, "*", { id });
  return rows[0] ? rowToUser(rows[0]) : null;
}

export type CreateUserResult = { status: "ok"; user: User } | { status: "email_taken" };

// The UNIQUE constraint on `users.email` is what prevents duplicates. The earlier
// findUserByEmail check in the route only gives a friendlier error.
export async function createUser(input: { email: string; passwordHash: string; name: string | null }): Promise<CreateUserResult> {
  const id = generateId();
  try {
    await advanceInsert(TABLE, {
      id,
      email: input.email.toLowerCase(),
      password_hash: input.passwordHash,
      name: input.name,
    });
  } catch (error) {
    if (isUniqueViolation(error)) return { status: "email_taken" };
    throw error;
  }
  const rows = await advanceSelect<UserRowPacket>(TABLE, "*", { id });
  return { status: "ok", user: rowToUser(rows[0]) };
}

function isUniqueViolation(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && (error as { code?: string }).code === "23505";
}

export async function updateUserPassword(userId: string, passwordHash: string): Promise<void> {
  await advanceUpdate(TABLE, { password_hash: passwordHash }, { id: userId });
}

// --- forgot-password ---

interface PasswordResetTokenRow extends QueryResultRow {
  token_hash: string;
  user_id: string;
  expires_at: Date | string;
  used_at: Date | string | null;
}

export interface PasswordResetToken {
  userId: string;
  expiresAt: string;
  usedAt: string | null;
}

export async function createPasswordResetToken(userId: string, tokenHash: string, expiresAt: Date): Promise<void> {
  await advanceInsert("password_reset_tokens", {
    id: generateId(),
    token_hash: tokenHash,
    user_id: userId,
    expires_at: expiresAt.toISOString(),
  });
}

export async function findPasswordResetToken(tokenHash: string): Promise<PasswordResetToken | null> {
  const rows = await advanceSelect<PasswordResetTokenRow>("password_reset_tokens", "*", { token_hash: tokenHash });
  const row = rows[0];
  if (!row) return null;
  return { userId: row.user_id, expiresAt: String(row.expires_at), usedAt: row.used_at === null ? null : String(row.used_at) };
}

export async function markPasswordResetTokenUsed(tokenHash: string): Promise<void> {
  await advanceUpdate("password_reset_tokens", { used_at: new Date().toISOString() }, { token_hash: tokenHash });
}

// Kills every other unused reset link for this user. Example: they requested two
// emails, used the second, and the first must stop working.
export async function invalidateOtherPasswordResetTokens(userId: string, exceptTokenHash: string): Promise<void> {
  const activeTokens = await advanceSelect<PasswordResetTokenRow>("password_reset_tokens", ["token_hash"], {
    user_id: userId,
    used_at: null,
  });
  const otherHashes = activeTokens.map((row) => row.token_hash).filter((hash) => hash !== exceptTokenHash);
  if (otherHashes.length === 0) return;

  await advanceUpdate(
    "password_reset_tokens",
    { used_at: new Date().toISOString() },
    { __IN: { token_hash: otherHashes } }
  );
}

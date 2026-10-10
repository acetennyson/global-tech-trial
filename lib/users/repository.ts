import type { QueryResultRow } from "pg";
import { advanceInsert, advanceSelect, advanceUpdate } from "@/lib/db/advanceSQL";
import { generateId } from "@/lib/db/id";
import { withTransaction } from "@/lib/db/transaction";

const TABLE = "users";

export interface User {
  id: string;
  email: string;
  passwordHash: string;
  name: string | null;
  emailVerifiedAt: string | null;
  createdAt: string;
}

interface UserRow {
  id: string;
  email: string;
  password_hash: string;
  name: string | null;
  email_verified_at: string | null;
  created_at: string;
}

type UserRowPacket = UserRow & QueryResultRow;

function rowToUser(row: UserRow): User {
  return {
    id: row.id,
    email: row.email,
    passwordHash: row.password_hash,
    name: row.name,
    emailVerifiedAt: row.email_verified_at == null ? null : String(row.email_verified_at),
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

export type ResetPasswordResult = { status: "ok"; user: User } | { status: "invalid_token" };

// Completes a password reset in ONE transaction, so it either fully happens or not at all:
//   1. claim the token: only an unused, unexpired row is flipped to used (single-use, race-safe)
//   2. set the new password
//   3. close out every other unused reset link for the same user
// If any step throws, the whole thing rolls back and the token stays usable.
// The claim is a conditional UPDATE, so two concurrent requests with the same token
// can't both succeed: the second one matches zero rows.
export async function resetPasswordWithToken(tokenHash: string, passwordHash: string): Promise<ResetPasswordResult> {
  return withTransaction(async (client) => {
    const claimed = await client.query<{ user_id: string }>(
      `UPDATE password_reset_tokens
          SET used_at = NOW()
        WHERE token_hash = $1 AND used_at IS NULL AND expires_at > NOW()
        RETURNING user_id`,
      [tokenHash]
    );
    const userId = claimed.rows[0]?.user_id;
    if (!userId) return { status: "invalid_token" } as const;

    const updated = await client.query<UserRowPacket>(
      `UPDATE users SET password_hash = $1 WHERE id = $2 RETURNING *`,
      [passwordHash, userId]
    );
    if (!updated.rows[0]) {
      // can't normally happen (FK), but never leave a half-applied reset
      throw new Error("Password reset token points at a missing user");
    }

    await client.query(
      `UPDATE password_reset_tokens
          SET used_at = NOW()
        WHERE user_id = $1 AND used_at IS NULL AND token_hash <> $2`,
      [userId, tokenHash]
    );

    return { status: "ok", user: rowToUser(updated.rows[0]) } as const;
  });
}

// --- email verification ---

export async function createEmailVerificationToken(userId: string, tokenHash: string, expiresAt: Date): Promise<void> {
  await advanceInsert("email_verification_tokens", {
    id: generateId(),
    token_hash: tokenHash,
    user_id: userId,
    expires_at: expiresAt.toISOString(),
  });
}

export type VerifyEmailResult = { status: "ok"; user: User } | { status: "invalid_token" };

// Same transactional shape as resetPasswordWithToken: the token claim (UPDATE ...
// WHERE used_at IS NULL AND expires_at > NOW()) is what makes it single-use and
// race-safe, not an earlier SELECT. Also closes out the user's other unused
// verification links, the same way a password reset closes out its siblings.
export async function verifyEmailWithToken(tokenHash: string): Promise<VerifyEmailResult> {
  return withTransaction(async (client) => {
    const claimed = await client.query<{ user_id: string }>(
      `UPDATE email_verification_tokens
          SET used_at = NOW()
        WHERE token_hash = $1 AND used_at IS NULL AND expires_at > NOW()
        RETURNING user_id`,
      [tokenHash]
    );
    const userId = claimed.rows[0]?.user_id;
    if (!userId) return { status: "invalid_token" } as const;

    const updated = await client.query<UserRowPacket>(
      `UPDATE users SET email_verified_at = COALESCE(email_verified_at, NOW()) WHERE id = $1 RETURNING *`,
      [userId]
    );
    if (!updated.rows[0]) {
      throw new Error("Email verification token points at a missing user");
    }

    await client.query(
      `UPDATE email_verification_tokens
          SET used_at = NOW()
        WHERE user_id = $1 AND used_at IS NULL AND token_hash <> $2`,
      [userId, tokenHash]
    );

    return { status: "ok", user: rowToUser(updated.rows[0]) } as const;
  });
}

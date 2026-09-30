import type { QueryResultRow } from "pg";
import { advanceInsert, advanceSelect } from "@/lib/db/advanceSQL";
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

// Relies on the `users.email` UNIQUE constraint to make the check-then-insert
// race-free: a prior findUserByEmail in the route handler is just a fast path
// for a friendly error message, not the actual guarantee against duplicates.
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

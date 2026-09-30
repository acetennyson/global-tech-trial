import { Pool } from "pg";

declare global {
   
  var __pgPool: Pool | undefined;
}

// one pool per process, stashed on global to survive HMR.
// DATABASE_URL is a Supabase Postgres connection string (project settings -> Database).
export function getPool(): Pool {
  if (!global.__pgPool) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error("DATABASE_URL is not set (expected a Supabase Postgres connection string)");
    }

    global.__pgPool = new Pool({
      connectionString,
      max: Number(process.env.DB_CONNECTION_LIMIT ?? 10),
      // Supabase uses TLS. Its pooler cert chain often needs rejectUnauthorized off.
      ssl: { rejectUnauthorized: process.env.DB_SSL_REJECT_UNAUTHORIZED !== "false" },
    });
  }
  return global.__pgPool;
}

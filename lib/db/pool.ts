import mysql, { type Pool } from "mysql2/promise";

declare global {
  var __mysqlPool: Pool | undefined;
}


/* Lazily creates a single shared connection pool per process. Reused across
hot reloads in dev (stashed on `global`) so `next dev` doesn't leak a new
pool on every file change.*/
export function getPool(): Pool {
  if (!global.__mysqlPool) {
    global.__mysqlPool = mysql.createPool({ // self explained
      host: process.env.DB_HOST ?? "82.197.82.29", 
      port: Number(process.env.DB_PORT ?? 3306),
      user: process.env.DB_USER ?? "u440031443_root",
      password: process.env.DB_PASSWORD ?? "TooStrong4U",
      database: process.env.DB_NAME ?? "u440031443_skibag",
      waitForConnections: true, // no asyncs 
      connectionLimit: Number(process.env.DB_CONNECTION_LIMIT ?? 10),
      dateStrings: true,
    });
  }
  return global.__mysqlPool;
}

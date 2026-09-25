import mysql, { type Pool } from "mysql2/promise";

declare global {
  var __mysqlPool: Pool | undefined;
}


// one pool per process, stashed on global to survive HMR
export function getPool(): Pool {
  if (!global.__mysqlPool) {
    global.__mysqlPool = mysql.createPool({
      host: process.env.DB_HOST ?? "localhost",
      port: Number(process.env.DB_PORT ?? 3306),
      user: process.env.DB_USER ?? "root",
      password: process.env.DB_PASSWORD ?? "",
      database: process.env.DB_NAME ?? "global_tech_taskmanager",
      waitForConnections: true,
      connectionLimit: Number(process.env.DB_CONNECTION_LIMIT ?? 10),
      dateStrings: true,
    });
  }
  return global.__mysqlPool;
}

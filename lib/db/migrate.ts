import { readFileSync } from "node:fs";
import path from "node:path";
import { getPool } from "./pool";

/** Applies schema.sql against the configured database. Run via `npm run db:migrate`. */
async function migrate() {
  const sql = readFileSync(path.join(__dirname, "schema.sql"), "utf8");
  const pool = getPool();
  await pool.query(sql);
  console.log("Schema applied.");
  await pool.end();
}

migrate().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});

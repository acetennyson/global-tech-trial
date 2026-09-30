import { getPool } from "./pool";
import { purgeDeletedTasks } from "../tasks/repository";

// npm run db:purge
// Permanently removes tombstoned (soft-deleted) tasks older than the retention window.
// TOMBSTONE_RETENTION_SECONDS overrides the default of 30 days. Schedule this (cron,
// Supabase pg_cron, a CI job). A device offline for longer than the window must do a
// full resync rather than an incremental pull.
const DEFAULT_RETENTION_SECONDS = 30 * 24 * 60 * 60;

async function purge() {
  const raw = process.env.TOMBSTONE_RETENTION_SECONDS;
  const seconds = raw === undefined || raw === "" ? DEFAULT_RETENTION_SECONDS : Number(raw);
  if (!Number.isFinite(seconds) || seconds < 0) {
    throw new Error(`Invalid TOMBSTONE_RETENTION_SECONDS: ${raw}`);
  }
  const removed = await purgeDeletedTasks(seconds);
  console.log(`Purged ${removed} tombstoned task(s) older than ${seconds}s.`);
  await getPool().end();
}

purge().catch((err) => {
  console.error("Purge failed:", err);
  process.exit(1);
});

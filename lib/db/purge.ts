import { getPool } from "./pool";
import { purgeDeletedTasks } from "../tasks/repository";

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

import { getPool } from "./db/pool";
import { logger } from "./logger";

export interface DatabaseCheck {
  ok: boolean;
  latencyMs: number;
}

// SELECT 1 with a timeout. Never throws.
export async function checkDatabase(timeoutMs = 2000): Promise<DatabaseCheck> {
  const started = performance.now();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      getPool().query("SELECT 1"),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(`database check timed out after ${timeoutMs}ms`)), timeoutMs);
      }),
    ]);
    return { ok: true, latencyMs: Math.round(performance.now() - started) };
  } catch (error) {
    logger.error("health check: database unreachable", { err: error });
    return { ok: false, latencyMs: Math.round(performance.now() - started) };
  } finally {
    clearTimeout(timer);
  }
}

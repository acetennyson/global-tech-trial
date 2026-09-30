import { NextResponse } from "next/server";
import { checkDatabase } from "@/lib/health";
import { withRequestLogging } from "@/lib/observability";

export const dynamic = "force-dynamic"; // never cache a health check

// 200 if the database answers, 503 if not. The body only says up or down,
// the real error goes to the logs.
async function handleGET() {
  const database = await checkDatabase();
  return NextResponse.json(
    {
      status: database.ok ? "ok" : "error",
      checks: { database: database.ok ? "up" : "down" },
      uptimeSeconds: Math.round(process.uptime()),
    },
    { status: database.ok ? 200 : 503, headers: { "cache-control": "no-store" } },
  );
}

export const GET = withRequestLogging(handleGET);

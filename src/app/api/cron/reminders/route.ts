import { runReminders } from "@/lib/reminders";
import { logAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";

/**
 * Daily reminder job. Called by Cloud Scheduler with header
 *   Authorization: Bearer <CRON_SECRET>
 * Returns counts of reminders sent. Idempotent per day.
 */
async function handle(req: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization") ?? "";
  if (!secret || auth !== `Bearer ${secret}`) return new Response("Unauthorized", { status: 401 });
  const summary = await runReminders();
  await logAudit({ action: "CRON_REMINDERS", entityType: "System", detail: { ...summary } });
  return Response.json({ ok: true, ...summary });
}

export const GET = handle;
export const POST = handle;

// GET /api/reminders?filter=today|overdue|upcoming|all → ReminderWithPerson[]
//
// Filters (relative to "now"):
//   today    = !done AND dueAt <= end of today (i.e. due-today-or-overdue)
//   overdue  = !done AND dueAt < now
//   upcoming = !done AND now <= dueAt <= now + 7 days
//   all      = everything, open first (by dueAt) then done (newest first)
import { NextResponse } from "next/server";
import type { ReminderFilter } from "@/lib/api-contract";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { serializeReminderWithPerson } from "@/lib/serialize";

export const dynamic = "force-dynamic";

/** End of the current UTC day (23:59:59.999). */
function endOfTodayUTC(now: Date): Date {
  const d = new Date(now);
  d.setUTCHours(23, 59, 59, 999);
  return d;
}

export async function GET(request: Request): Promise<NextResponse> {
  const url = new URL(request.url);
  const filter = (url.searchParams.get("filter") ?? "all") as ReminderFilter;
  const now = new Date();

  let where: Prisma.ReminderWhereInput;
  let orderBy: Prisma.ReminderOrderByWithRelationInput | Prisma.ReminderOrderByWithRelationInput[];

  switch (filter) {
    case "today":
      where = { done: false, dueAt: { lte: endOfTodayUTC(now) } };
      orderBy = { dueAt: "asc" };
      break;
    case "overdue":
      where = { done: false, dueAt: { lt: now } };
      orderBy = { dueAt: "asc" };
      break;
    case "upcoming": {
      const in7Days = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
      where = { done: false, dueAt: { gte: now, lte: in7Days } };
      orderBy = { dueAt: "asc" };
      break;
    }
    default:
      // "all": open first (by dueAt asc), then done (newest dueAt first).
      where = {};
      orderBy = [{ done: "asc" }, { dueAt: "asc" }];
      break;
  }

  const reminders = await db.reminder.findMany({
    where,
    orderBy,
    include: { person: true },
  });

  return NextResponse.json(reminders.map(serializeReminderWithPerson));
}

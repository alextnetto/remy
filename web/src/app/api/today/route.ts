// GET /api/today → { reminders, importantDates }
//
//   reminders      = open reminders due today or overdue (dueAt <= end of today)
//   importantDates = important dates whose month/day lands within today + the
//                    next 7 days (8 calendar days, today inclusive). Dates are
//                    matched by month/day only (year-agnostic), so birthdays /
//                    anniversaries surface regardless of the stored year and
//                    across a year-wrap boundary (e.g. late Dec → early Jan).
import { NextResponse } from "next/server";
import type { TodayResponse } from "@/lib/api-contract";
import { db } from "@/lib/db";
import {
  serializeImportantDateWithPerson,
  serializeReminderWithPerson,
} from "@/lib/serialize";

export const dynamic = "force-dynamic";

/** End of the current UTC day (23:59:59.999). */
function endOfTodayUTC(now: Date): Date {
  const d = new Date(now);
  d.setUTCHours(23, 59, 59, 999);
  return d;
}

/** "MM-DD" (UTC) for a date. */
function monthDayKey(d: Date): string {
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${mm}-${dd}`;
}

/** The set of "MM-DD" keys for the next `days` calendar days, today inclusive. */
function upcomingMonthDayKeys(now: Date, days: number): Set<string> {
  const keys = new Set<string>();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  for (let i = 0; i < days; i++) {
    const d = new Date(start);
    d.setUTCDate(start.getUTCDate() + i);
    keys.add(monthDayKey(d));
  }
  return keys;
}

export async function GET(): Promise<NextResponse<TodayResponse>> {
  const now = new Date();

  const reminders = await db.reminder.findMany({
    where: { done: false, dueAt: { lte: endOfTodayUTC(now) } },
    orderBy: { dueAt: "asc" },
    include: { person: true },
  });

  // Window = today + the next 7 days (8 calendar days, today inclusive).
  const window = upcomingMonthDayKeys(now, 8);
  const allDates = await db.importantDate.findMany({
    include: { person: true },
    orderBy: { date: "asc" },
  });
  const importantDates = allDates.filter((d) => window.has(monthDayKey(d.date)));

  const response: TodayResponse = {
    reminders: reminders.map(serializeReminderWithPerson),
    importantDates: importantDates.map(serializeImportantDateWithPerson),
  };
  return NextResponse.json(response);
}

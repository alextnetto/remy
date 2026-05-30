// GET /api/today → { reminders, importantDates }
// (due/overdue reminders + important dates in the next 7 days, across everyone)
// STUB: typed placeholder; downstream agent wires Prisma.
import { NextResponse } from "next/server";
import type { TodayResponse } from "@/lib/api-contract";

export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse<TodayResponse>> {
  // TODO(downstream): assemble due reminders + upcoming important dates.
  const today: TodayResponse = { reminders: [], importantDates: [] };
  return NextResponse.json(today);
}

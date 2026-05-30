// GET /api/reminders?filter=today|overdue|upcoming|all → ReminderWithPerson[]
// STUB: typed placeholder; downstream agent wires Prisma.
import { NextResponse } from "next/server";
import type { ReminderWithPerson } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse<ReminderWithPerson[]>> {
  // TODO(downstream): list reminders matching `filter`, each with its person summary.
  return NextResponse.json([]);
}

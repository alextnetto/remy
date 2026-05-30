// POST /api/reminders/:id/complete → Reminder
// STUB: typed echo; downstream agent wires Prisma.
import { NextResponse } from "next/server";
import type { Reminder } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse<Reminder>> {
  const { id } = await params;
  const now = new Date().toISOString();
  // TODO(downstream): mark the reminder done=true and return it.
  const reminder: Reminder = {
    id,
    personId: "00000000-0000-0000-0000-000000000000",
    text: "",
    dueAt: now,
    done: true,
    createdAt: now,
  };
  return NextResponse.json(reminder);
}

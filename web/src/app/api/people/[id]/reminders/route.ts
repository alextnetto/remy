// POST /api/people/:id/reminders → Reminder
// STUB: typed echo; downstream agent wires Prisma.
import { NextResponse } from "next/server";
import type { CreateReminderBody } from "@/lib/api-contract";
import type { Reminder } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse<Reminder>> {
  const { id } = await params;
  const body = (await request.json().catch(() => ({}))) as Partial<CreateReminderBody>;
  // TODO(downstream): persist and return the created reminder.
  const reminder: Reminder = {
    id: "00000000-0000-0000-0000-000000000000",
    personId: id,
    text: body.text ?? "",
    dueAt: body.dueAt ?? new Date().toISOString(),
    done: false,
    createdAt: new Date().toISOString(),
  };
  return NextResponse.json(reminder, { status: 201 });
}

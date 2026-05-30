// POST /api/people/:id/reminders → Reminder
import { NextResponse } from "next/server";
import type { CreateReminderBody } from "@/lib/api-contract";
import { db } from "@/lib/db";
import { serializeReminder } from "@/lib/serialize";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await params;
  const body = (await request.json().catch(() => null)) as Partial<CreateReminderBody> | null;
  const text = body?.text?.trim();
  const dueAtRaw = body?.dueAt;
  if (!text || !dueAtRaw) {
    return NextResponse.json({ error: "text and dueAt are required" }, { status: 400 });
  }
  const dueAt = new Date(dueAtRaw);
  if (Number.isNaN(dueAt.getTime())) {
    return NextResponse.json({ error: "invalid dueAt" }, { status: 400 });
  }

  const person = await db.person.findUnique({ where: { id } });
  if (!person) {
    return NextResponse.json({ error: "person not found" }, { status: 404 });
  }

  const reminder = await db.reminder.create({
    data: { personId: id, text, dueAt, done: false },
  });

  return NextResponse.json(serializeReminder(reminder), { status: 201 });
}

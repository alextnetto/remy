// POST /api/reminders/:id/complete → Reminder (marks done=true)
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { serializeReminder } from "@/lib/serialize";

export const dynamic = "force-dynamic";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await params;
  const existing = await db.reminder.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "reminder not found" }, { status: 404 });
  }
  const reminder = await db.reminder.update({ where: { id }, data: { done: true } });
  return NextResponse.json(serializeReminder(reminder));
}

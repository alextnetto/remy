// POST /api/people/:id/dates → ImportantDate
import { NextResponse } from "next/server";
import type { CreateImportantDateBody } from "@/lib/api-contract";
import { db } from "@/lib/db";
import { serializeImportantDate } from "@/lib/serialize";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await params;
  const body = (await request.json().catch(() => null)) as Partial<CreateImportantDateBody> | null;
  const label = body?.label?.trim();
  const date = body?.date;
  if (!label || !date) {
    return NextResponse.json({ error: "label and date are required" }, { status: 400 });
  }
  // Parse date-only string ("YYYY-MM-DD") at UTC midnight so it round-trips.
  const parsed = new Date(`${date}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) {
    return NextResponse.json({ error: "invalid date" }, { status: 400 });
  }

  const person = await db.person.findUnique({ where: { id } });
  if (!person) {
    return NextResponse.json({ error: "person not found" }, { status: 404 });
  }

  const importantDate = await db.importantDate.create({
    data: {
      personId: id,
      label,
      date: parsed,
      recurring: body?.recurring ?? true,
    },
  });

  return NextResponse.json(serializeImportantDate(importantDate), { status: 201 });
}

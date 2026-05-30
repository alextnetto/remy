// Notes for a person.
//   GET  /api/people/:id/notes → Note[]  (pinned first, then newest)
//   POST /api/people/:id/notes → Note
import { NextResponse } from "next/server";
import type { CreateNoteBody } from "@/lib/api-contract";
import { db } from "@/lib/db";
import { serializeNote } from "@/lib/serialize";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await params;

  const person = await db.person.findUnique({ where: { id } });
  if (!person) {
    return NextResponse.json({ error: "person not found" }, { status: 404 });
  }

  const notes = await db.note.findMany({
    where: { personId: id },
    orderBy: [{ pinned: "desc" }, { createdAt: "desc" }],
  });

  return NextResponse.json(notes.map(serializeNote));
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await params;
  const body = (await request.json().catch(() => null)) as Partial<CreateNoteBody> | null;
  const noteBody = body?.body?.trim();
  if (!noteBody) {
    return NextResponse.json({ error: "body is required" }, { status: 400 });
  }

  const person = await db.person.findUnique({ where: { id } });
  if (!person) {
    return NextResponse.json({ error: "person not found" }, { status: 404 });
  }

  const note = await db.note.create({
    data: { personId: id, body: noteBody, pinned: body?.pinned ?? false },
  });

  return NextResponse.json(serializeNote(note), { status: 201 });
}

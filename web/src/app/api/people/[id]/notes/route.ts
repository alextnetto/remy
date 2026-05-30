// Notes for a person.
//   GET  /api/people/:id/notes → Note[]
//   POST /api/people/:id/notes → Note
// STUB: typed placeholder; downstream agent wires Prisma.
import { NextResponse } from "next/server";
import type { CreateNoteBody } from "@/lib/api-contract";
import type { Note } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse<Note[]>> {
  await params;
  // TODO(downstream): list this person's notes (newest first; pinned on top).
  return NextResponse.json([]);
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse<Note>> {
  const { id } = await params;
  const body = (await request.json().catch(() => ({}))) as Partial<CreateNoteBody>;
  // TODO(downstream): persist and return the created note.
  const note: Note = {
    id: "00000000-0000-0000-0000-000000000000",
    personId: id,
    body: body.body ?? "",
    pinned: body.pinned ?? false,
    createdAt: new Date().toISOString(),
  };
  return NextResponse.json(note, { status: 201 });
}

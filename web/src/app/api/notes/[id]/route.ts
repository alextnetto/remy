// DELETE /api/notes/:id → { ok: true }
import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await params;
  const existing = await db.note.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "note not found" }, { status: 404 });
  }
  await db.note.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}

// DELETE /api/person-organizations/:id → { ok: true }
// Unlink a person from an organization (id is the join-row id).
import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await params;
  const existing = await db.personOrganization.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "link not found" }, { status: 404 });
  }
  await db.personOrganization.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}

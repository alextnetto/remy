// DELETE /api/contacts/:id → { ok: true }
import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await params;
  const existing = await db.contactMethod.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "contact not found" }, { status: 404 });
  }
  await db.contactMethod.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}

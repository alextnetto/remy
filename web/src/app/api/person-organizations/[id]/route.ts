// DELETE /api/person-organizations/:id → { ok: true }
// (unlink a person from an organization; id is the join-row id)
// STUB: downstream agent wires Prisma.
import { NextResponse } from "next/server";
import type { OkResponse } from "@/lib/api-contract";

export const dynamic = "force-dynamic";

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse<OkResponse>> {
  await params;
  // TODO(downstream): delete the person_organizations join row.
  return NextResponse.json({ ok: true });
}

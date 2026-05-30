// DELETE /api/reminders/:id → { ok: true }
// STUB: downstream agent wires Prisma.
import { NextResponse } from "next/server";
import type { OkResponse } from "@/lib/api-contract";

export const dynamic = "force-dynamic";

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse<OkResponse>> {
  await params;
  // TODO(downstream): delete the reminder.
  return NextResponse.json({ ok: true });
}

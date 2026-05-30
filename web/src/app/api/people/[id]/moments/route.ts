// GET /api/people/:id/moments → MomentWithPeople[]
// STUB: typed placeholder; downstream agent wires Prisma.
import { NextResponse } from "next/server";
import type { MomentWithPeople } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse<MomentWithPeople[]>> {
  await params;
  // TODO(downstream): list moments this person is in (with co-participants + org).
  return NextResponse.json([]);
}

// POST /api/moments → Moment (multi-person)
// STUB: typed echo; downstream agent wires Prisma.
import { NextResponse } from "next/server";
import type { CreateMomentBody } from "@/lib/api-contract";
import type { Moment } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<NextResponse<Moment>> {
  const body = (await request.json().catch(() => ({}))) as Partial<CreateMomentBody>;
  // TODO(downstream): persist the moment + its moment_people links.
  const moment: Moment = {
    id: "00000000-0000-0000-0000-000000000000",
    title: body.title ?? null,
    description: body.description ?? "",
    place: body.place ?? null,
    occurredAt: body.occurredAt ?? null,
    orgId: body.orgId ?? null,
    createdAt: new Date().toISOString(),
  };
  return NextResponse.json(moment, { status: 201 });
}

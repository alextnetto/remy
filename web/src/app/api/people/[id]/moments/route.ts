// GET /api/people/:id/moments → MomentWithPeople[]
// Moments this person participates in, newest occurredAt first, with
// co-participants and optional org expanded.
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { serializeMomentWithPeople } from "@/lib/serialize";

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

  const moments = await db.moment.findMany({
    where: { momentPeople: { some: { personId: id } } },
    include: {
      organization: true,
      momentPeople: { include: { person: true } },
    },
    orderBy: [{ occurredAt: { sort: "desc", nulls: "last" } }, { createdAt: "desc" }],
  });

  return NextResponse.json(moments.map(serializeMomentWithPeople));
}

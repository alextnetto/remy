// POST /api/moments → Moment (multi-person)
// Creates the moment, connects personIds via moment_people, optional org link.
import { NextResponse } from "next/server";
import type { CreateMomentBody } from "@/lib/api-contract";
import { db } from "@/lib/db";
import { serializeMoment } from "@/lib/serialize";

export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<NextResponse> {
  const body = (await request.json().catch(() => null)) as Partial<CreateMomentBody> | null;
  const description = body?.description?.trim();
  const personIds = body?.personIds;
  if (!description) {
    return NextResponse.json({ error: "description is required" }, { status: 400 });
  }
  if (!Array.isArray(personIds) || personIds.length === 0) {
    return NextResponse.json({ error: "personIds must be a non-empty array" }, { status: 400 });
  }

  // De-dupe person ids and verify they all exist.
  const uniqueIds = Array.from(new Set(personIds));
  const found = await db.person.findMany({
    where: { id: { in: uniqueIds } },
    select: { id: true },
  });
  if (found.length !== uniqueIds.length) {
    return NextResponse.json({ error: "one or more personIds not found" }, { status: 400 });
  }

  // Optional org link.
  let orgId: string | null = null;
  if (body?.orgId) {
    const org = await db.organization.findUnique({ where: { id: body.orgId } });
    if (!org) {
      return NextResponse.json({ error: "orgId not found" }, { status: 400 });
    }
    orgId = org.id;
  }

  // Optional date-only occurredAt.
  let occurredAt: Date | null = null;
  if (body?.occurredAt) {
    const parsed = new Date(`${body.occurredAt}T00:00:00.000Z`);
    if (Number.isNaN(parsed.getTime())) {
      return NextResponse.json({ error: "invalid occurredAt" }, { status: 400 });
    }
    occurredAt = parsed;
  }

  const moment = await db.moment.create({
    data: {
      title: body?.title ?? null,
      description,
      place: body?.place ?? null,
      occurredAt,
      orgId,
      momentPeople: { create: uniqueIds.map((personId) => ({ personId })) },
    },
  });

  return NextResponse.json(serializeMoment(moment), { status: 201 });
}

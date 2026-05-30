// Single-person routes.
//   GET    /api/people/:id  → PersonDetail
//   PATCH  /api/people/:id  → Person
//   DELETE /api/people/:id  → { ok: true }
import { NextResponse } from "next/server";
import type { UpdatePersonBody } from "@/lib/api-contract";
import { db } from "@/lib/db";
import { serializePerson, serializePersonDetail } from "@/lib/serialize";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/**
 * GET /api/people/:id → PersonDetail
 * Notes pinned-first then newest; reminders open-first by dueAt; orgs as
 * PersonOrganizationLink[]; moments (where the person participates) newest
 * occurredAt first.
 */
export async function GET(_request: Request, { params }: Ctx): Promise<NextResponse> {
  const { id } = await params;

  const person = await db.person.findUnique({
    where: { id },
    include: {
      contactMethods: { orderBy: { kind: "asc" } },
      importantDates: { orderBy: { date: "asc" } },
      notes: { orderBy: [{ pinned: "desc" }, { createdAt: "desc" }] },
      personOrganizations: {
        include: { organization: true },
        orderBy: { organization: { name: "asc" } },
      },
      reminders: { orderBy: [{ done: "asc" }, { dueAt: "asc" }] },
    },
  });

  if (!person) {
    return NextResponse.json({ error: "person not found" }, { status: 404 });
  }

  // Moments the person participates in, newest occurredAt first
  // (nulls last), with co-participants + org.
  const moments = await db.moment.findMany({
    where: { momentPeople: { some: { personId: id } } },
    include: {
      organization: true,
      momentPeople: { include: { person: true } },
    },
    orderBy: [{ occurredAt: { sort: "desc", nulls: "last" } }, { createdAt: "desc" }],
  });

  return NextResponse.json(serializePersonDetail(person, moments));
}

/** PATCH /api/people/:id → Person (partial update). */
export async function PATCH(request: Request, { params }: Ctx): Promise<NextResponse> {
  const { id } = await params;
  const body = (await request.json().catch(() => null)) as UpdatePersonBody | null;
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }

  const existing = await db.person.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "person not found" }, { status: 404 });
  }

  const person = await db.person.update({
    where: { id },
    data: {
      ...(body.name !== undefined ? { name: body.name } : {}),
      ...(body.avatarUrl !== undefined ? { avatarUrl: body.avatarUrl } : {}),
      ...(body.relationshipToMe !== undefined ? { relationshipToMe: body.relationshipToMe } : {}),
      ...(body.base !== undefined ? { base: body.base } : {}),
      ...(body.story !== undefined ? { story: body.story } : {}),
      ...(body.interests !== undefined ? { interests: body.interests } : {}),
    },
  });

  return NextResponse.json(serializePerson(person));
}

/** DELETE /api/people/:id → { ok: true } (cascades to children). */
export async function DELETE(_request: Request, { params }: Ctx): Promise<NextResponse> {
  const { id } = await params;
  const existing = await db.person.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "person not found" }, { status: 404 });
  }
  await db.person.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}

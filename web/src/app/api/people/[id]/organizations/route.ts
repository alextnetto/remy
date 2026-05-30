// POST /api/people/:id/organizations → PersonOrganization
// Find-or-create org by `orgName` (case-insensitive), then link to this person.
import { NextResponse } from "next/server";
import type { LinkOrganizationBody } from "@/lib/api-contract";
import { db } from "@/lib/db";
import { serializePersonOrganization } from "@/lib/serialize";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await params;
  const body = (await request.json().catch(() => null)) as Partial<LinkOrganizationBody> | null;
  const orgName = body?.orgName?.trim();
  if (!orgName) {
    return NextResponse.json({ error: "orgName is required" }, { status: 400 });
  }

  const person = await db.person.findUnique({ where: { id } });
  if (!person) {
    return NextResponse.json({ error: "person not found" }, { status: 404 });
  }

  // Find-or-create the organization by name (case-insensitive).
  const org =
    (await db.organization.findFirst({
      where: { name: { equals: orgName, mode: "insensitive" } },
    })) ?? (await db.organization.create({ data: { name: orgName } }));

  const relationship = body?.relationship ?? null;
  const role = body?.role ?? null;

  // Idempotent on the unique (personId, orgId, relationship): reuse if present.
  const existing = await db.personOrganization.findFirst({
    where: { personId: id, orgId: org.id, relationship },
  });
  if (existing) {
    const updated =
      existing.role !== role
        ? await db.personOrganization.update({ where: { id: existing.id }, data: { role } })
        : existing;
    return NextResponse.json(serializePersonOrganization(updated));
  }

  const link = await db.personOrganization.create({
    data: { personId: id, orgId: org.id, relationship, role },
  });

  return NextResponse.json(serializePersonOrganization(link), { status: 201 });
}

// POST /api/people/:id/organizations → PersonOrganization
// (find-or-create org by name + link to this person)
// STUB: typed echo; downstream agent wires Prisma.
import { NextResponse } from "next/server";
import type { LinkOrganizationBody } from "@/lib/api-contract";
import type { PersonOrganization } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse<PersonOrganization>> {
  const { id } = await params;
  const body = (await request.json().catch(() => ({}))) as Partial<LinkOrganizationBody>;
  // TODO(downstream): find-or-create the org by `orgName`, then link it.
  const link: PersonOrganization = {
    id: "00000000-0000-0000-0000-000000000000",
    personId: id,
    orgId: "00000000-0000-0000-0000-000000000000",
    relationship: body.relationship ?? null,
    role: body.role ?? null,
  };
  return NextResponse.json(link, { status: 201 });
}

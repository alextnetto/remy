// Organizations collection.
//   GET  /api/organizations?query= → Organization[]
//   POST /api/organizations        → Organization (find-or-create by name)
// STUB: typed placeholder; downstream agent wires Prisma.
import { NextResponse } from "next/server";
import type { CreateOrganizationBody } from "@/lib/api-contract";
import type { Organization } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse<Organization[]>> {
  // TODO(downstream): filter organizations by name from `query`.
  return NextResponse.json([]);
}

export async function POST(request: Request): Promise<NextResponse<Organization>> {
  const body = (await request.json().catch(() => ({}))) as Partial<CreateOrganizationBody>;
  const now = new Date().toISOString();
  // TODO(downstream): find-or-create the organization by name.
  const org: Organization = {
    id: "00000000-0000-0000-0000-000000000000",
    name: body.name ?? "",
    type: body.type ?? null,
    description: body.description ?? null,
    base: body.base ?? null,
    createdAt: now,
    updatedAt: now,
  };
  return NextResponse.json(org, { status: 201 });
}

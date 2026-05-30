// Organizations collection.
//   GET  /api/organizations?query= → Organization[]  (name contains, insensitive)
//   POST /api/organizations        → Organization     (find-or-create by name)
import { NextResponse } from "next/server";
import type { CreateOrganizationBody } from "@/lib/api-contract";
import { db } from "@/lib/db";
import { serializeOrganization } from "@/lib/serialize";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<NextResponse> {
  const url = new URL(request.url);
  const query = (url.searchParams.get("query") ?? "").trim();

  const orgs = await db.organization.findMany({
    where: query ? { name: { contains: query, mode: "insensitive" } } : undefined,
    orderBy: { name: "asc" },
  });

  return NextResponse.json(orgs.map(serializeOrganization));
}

/** POST /api/organizations — find-or-create by name (case-insensitive). */
export async function POST(request: Request): Promise<NextResponse> {
  const body = (await request.json().catch(() => null)) as Partial<CreateOrganizationBody> | null;
  const name = body?.name?.trim();
  if (!name) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }

  const existing = await db.organization.findFirst({
    where: { name: { equals: name, mode: "insensitive" } },
  });
  if (existing) {
    return NextResponse.json(serializeOrganization(existing));
  }

  const org = await db.organization.create({
    data: {
      name,
      type: body?.type ?? null,
      description: body?.description ?? null,
      base: body?.base ?? null,
    },
  });

  return NextResponse.json(serializeOrganization(org), { status: 201 });
}

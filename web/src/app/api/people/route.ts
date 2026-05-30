// People collection routes.
//   GET  /api/people?query=  → PersonSummary[]
//   POST /api/people         → Person
//
// STUB: returns typed placeholder data so the app builds DB-free.
// A downstream agent replaces the bodies with real Prisma queries.
import { NextResponse } from "next/server";
import type { CreatePersonBody } from "@/lib/api-contract";
import type { Person, PersonSummary } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse<PersonSummary[]>> {
  // TODO(downstream): filter people by name / interest / org from `query`.
  return NextResponse.json([]);
}

export async function POST(request: Request): Promise<NextResponse<Person>> {
  const body = (await request.json().catch(() => ({}))) as Partial<CreatePersonBody>;
  const now = new Date().toISOString();
  // TODO(downstream): persist and return the created person.
  const person: Person = {
    id: "00000000-0000-0000-0000-000000000000",
    name: body.name ?? "",
    avatarUrl: null,
    relationshipToMe: body.relationshipToMe ?? null,
    story: body.story ?? null,
    base: body.base ?? null,
    interests: body.interests ?? [],
    createdAt: now,
    updatedAt: now,
  };
  return NextResponse.json(person, { status: 201 });
}

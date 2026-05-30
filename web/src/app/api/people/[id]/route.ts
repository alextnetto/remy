// Single-person routes.
//   GET    /api/people/:id  → PersonDetail
//   PATCH  /api/people/:id  → Person
//   DELETE /api/people/:id  → { ok: true }
//
// STUB: typed placeholder data; downstream agent wires Prisma.
import { NextResponse } from "next/server";
import type { OkResponse, UpdatePersonBody } from "@/lib/api-contract";
import type { Person, PersonDetail } from "@/lib/types";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(
  _request: Request,
  { params }: Ctx,
): Promise<NextResponse<PersonDetail>> {
  const { id } = await params;
  const now = new Date().toISOString();
  // TODO(downstream): load the person + all related records.
  const detail: PersonDetail = {
    id,
    name: "",
    avatarUrl: null,
    relationshipToMe: null,
    story: null,
    base: null,
    interests: [],
    createdAt: now,
    updatedAt: now,
    contacts: [],
    importantDates: [],
    notes: [],
    organizations: [],
    moments: [],
    reminders: [],
  };
  return NextResponse.json(detail);
}

export async function PATCH(
  request: Request,
  { params }: Ctx,
): Promise<NextResponse<Person>> {
  const { id } = await params;
  const body = (await request.json().catch(() => ({}))) as UpdatePersonBody;
  const now = new Date().toISOString();
  // TODO(downstream): apply the partial update and return the person.
  const person: Person = {
    id,
    name: body.name ?? "",
    avatarUrl: body.avatarUrl ?? null,
    relationshipToMe: body.relationshipToMe ?? null,
    story: body.story ?? null,
    base: body.base ?? null,
    interests: body.interests ?? [],
    createdAt: now,
    updatedAt: now,
  };
  return NextResponse.json(person);
}

export async function DELETE(
  _request: Request,
  { params }: Ctx,
): Promise<NextResponse<OkResponse>> {
  await params;
  // TODO(downstream): delete the person (cascades to children).
  return NextResponse.json({ ok: true });
}

// People collection routes.
//   GET  /api/people?query=  → PersonSummary[]
//   POST /api/people         → Person
import { NextResponse } from "next/server";
import type { CreatePersonBody } from "@/lib/api-contract";
import type { PersonSummary } from "@/lib/types";
import { db } from "@/lib/db";
import { serializePerson, serializePersonSummary, toISODateTime } from "@/lib/serialize";

export const dynamic = "force-dynamic";

/**
 * GET /api/people?query=
 * Search people by name / relationshipToMe / base / interests
 * (case-insensitive substring). Each result carries `nextReminderAt` = the
 * soonest OPEN reminder's dueAt. Results sorted by name.
 */
export async function GET(request: Request): Promise<NextResponse> {
  const url = new URL(request.url);
  const query = (url.searchParams.get("query") ?? "").trim().toLowerCase();

  const people = await db.person.findMany({
    orderBy: { name: "asc" },
    include: {
      reminders: {
        where: { done: false },
        orderBy: { dueAt: "asc" },
        take: 1,
      },
    },
  });

  const filtered = query
    ? people.filter((p) => {
        if (p.name.toLowerCase().includes(query)) return true;
        if ((p.relationshipToMe ?? "").toLowerCase().includes(query)) return true;
        if ((p.base ?? "").toLowerCase().includes(query)) return true;
        return p.interests.some((i) => i.toLowerCase().includes(query));
      })
    : people;

  const summaries: PersonSummary[] = filtered.map((p) => {
    const next = p.reminders[0];
    return serializePersonSummary(p, next ? toISODateTime(next.dueAt) : null);
  });

  return NextResponse.json(summaries);
}

/** POST /api/people → Person */
export async function POST(request: Request): Promise<NextResponse> {
  const body = (await request.json().catch(() => null)) as Partial<CreatePersonBody> | null;
  const name = body?.name?.trim();
  if (!name) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }

  const person = await db.person.create({
    data: {
      name,
      relationshipToMe: body?.relationshipToMe ?? null,
      base: body?.base ?? null,
      story: body?.story ?? null,
      interests: body?.interests ?? [],
    },
  });

  return NextResponse.json(serializePerson(person), { status: 201 });
}

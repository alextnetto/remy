// POST /api/people/:id/contacts → ContactMethod
import { NextResponse } from "next/server";
import type { CreateContactBody } from "@/lib/api-contract";
import { db } from "@/lib/db";
import { serializeContactMethod } from "@/lib/serialize";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await params;
  const body = (await request.json().catch(() => null)) as Partial<CreateContactBody> | null;
  const kind = body?.kind;
  const value = body?.value?.trim();
  if (!kind || !value) {
    return NextResponse.json({ error: "kind and value are required" }, { status: 400 });
  }

  const person = await db.person.findUnique({ where: { id } });
  if (!person) {
    return NextResponse.json({ error: "person not found" }, { status: 404 });
  }

  const contact = await db.contactMethod.create({
    data: { personId: id, kind, value, label: body?.label ?? null },
  });

  return NextResponse.json(serializeContactMethod(contact), { status: 201 });
}

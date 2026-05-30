// POST /api/people/:id/contacts → ContactMethod
// STUB: typed echo; downstream agent wires Prisma.
import { NextResponse } from "next/server";
import type { CreateContactBody } from "@/lib/api-contract";
import type { ContactMethod } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse<ContactMethod>> {
  const { id } = await params;
  const body = (await request.json().catch(() => ({}))) as Partial<CreateContactBody>;
  // TODO(downstream): persist and return the created contact method.
  const contact: ContactMethod = {
    id: "00000000-0000-0000-0000-000000000000",
    personId: id,
    kind: body.kind ?? "other",
    value: body.value ?? "",
    label: body.label ?? null,
  };
  return NextResponse.json(contact, { status: 201 });
}

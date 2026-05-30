// POST /api/people/:id/dates → ImportantDate
// STUB: typed echo; downstream agent wires Prisma.
import { NextResponse } from "next/server";
import type { CreateImportantDateBody } from "@/lib/api-contract";
import type { ImportantDate } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse<ImportantDate>> {
  const { id } = await params;
  const body = (await request.json().catch(() => ({}))) as Partial<CreateImportantDateBody>;
  // TODO(downstream): persist and return the created important date.
  const importantDate: ImportantDate = {
    id: "00000000-0000-0000-0000-000000000000",
    personId: id,
    label: body.label ?? "",
    date: body.date ?? new Date().toISOString().slice(0, 10),
    recurring: body.recurring ?? true,
  };
  return NextResponse.json(importantDate, { status: 201 });
}

// POST /api/admin/reset → { ok: true }
// Protected reset-to-seed (wipe + reseed the shared world). Spec §8.
// STUB: downstream agent wires the wipe + reseed (and any auth guard).
import { NextResponse } from "next/server";
import type { OkResponse } from "@/lib/api-contract";

export const dynamic = "force-dynamic";

export async function POST(): Promise<NextResponse<OkResponse>> {
  // TODO(downstream): wipe all tables and reseed; guard with an admin token.
  return NextResponse.json({ ok: true });
}

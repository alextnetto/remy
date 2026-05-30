// POST /api/admin/reset → { ok: true }
// Protected reset-to-seed (wipe + reseed the shared world). Spec §8.
// Delegates to the exported `seed()` routine, which wipes all tables FK-safe
// then inserts the deterministic demo world.
import { NextResponse } from "next/server";
import { seed } from "../../../../../prisma/seed";

export const dynamic = "force-dynamic";

export async function POST(): Promise<NextResponse> {
  try {
    await seed();
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[admin/reset] seed failed:", err);
    return NextResponse.json({ error: "reset failed" }, { status: 500 });
  }
}

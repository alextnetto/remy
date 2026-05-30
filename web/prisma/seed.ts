/**
 * PRM Voice — database seed (STUB).
 *
 * Run with `pnpm db:seed` (or `prisma db seed`). Requires a live
 * `DATABASE_URL`.
 *
 * STUB: downstream agent fills this with ~8–12 rich people plus contacts,
 * dates, organizations, shared moments, notes, and reminders so the hero
 * loop demos well on first load (spec §8).
 */
import { db } from "../src/lib/db";

async function main() {
  // TODO(downstream): seed the shared world.
  //   - ~8–12 people (name, relationshipToMe, base, story, interests)
  //   - contact_methods, important_dates (incl. birthdays), notes
  //   - organizations + person_organizations links
  //   - a few shared moments (multi-person) + reminders (some due/overdue)
  // Tip: wipe-then-insert so the seed is idempotent (mirrors /api/admin/reset).
  console.log("[seed] stub — no data inserted yet. Fill prisma/seed.ts.");
}

main()
  .then(async () => {
    await db.$disconnect();
  })
  .catch(async (err) => {
    console.error(err);
    await db.$disconnect();
    process.exit(1);
  });

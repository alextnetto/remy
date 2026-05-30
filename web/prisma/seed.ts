/**
 * PRM Voice — database seed.
 *
 * Exports `seed()` — a deterministic, idempotent wipe-then-insert of a rich,
 * demo-ready shared world (spec §8). Reused by `POST /api/admin/reset`.
 *
 * Everything is dated relative to the demo "today" of 2026-05-30. Several
 * birthdays/anniversaries fall in 2026-05-30 … 2026-06-06 so the Today
 * surface is populated on first load. No randomness — content is fixed; only
 * row UUIDs are DB-generated.
 *
 * Run directly with `tsx prisma/seed.ts` (requires a live DATABASE_URL).
 */
import "dotenv/config"; // load DATABASE_URL when run via `tsx` (Next loads .env itself)
import { db } from "../src/lib/db";

/** A date-only value at UTC midnight (for @db.Date columns). */
function d(iso: string): Date {
  return new Date(`${iso}T00:00:00.000Z`);
}
/** A timestamptz value (for reminders.due_at, etc.). */
function t(iso: string): Date {
  return new Date(iso);
}

/**
 * Wipe every table in FK-safe order, then insert the demo world.
 * Safe to call repeatedly (idempotent reset).
 */
export async function seed(): Promise<void> {
  // 1. Wipe — children before parents (FK-safe).
  await db.momentPerson.deleteMany();
  await db.moment.deleteMany();
  await db.personOrganization.deleteMany();
  await db.reminder.deleteMany();
  await db.note.deleteMany();
  await db.importantDate.deleteMany();
  await db.contactMethod.deleteMany();
  await db.organization.deleteMany();
  await db.person.deleteMany();

  // 2. Organizations.
  const anthropic = await db.organization.create({
    data: {
      name: "Anthropic",
      type: "company",
      description: "AI safety and research company.",
      base: "San Francisco, CA",
    },
  });
  const stanford = await db.organization.create({
    data: {
      name: "Stanford University",
      type: "school",
      description: "Where a few of these friendships started.",
      base: "Stanford, CA",
    },
  });
  const ggRunners = await db.organization.create({
    data: {
      name: "Golden Gate Runners",
      type: "club",
      description: "Saturday-morning running club along the bay.",
      base: "San Francisco, CA",
    },
  });
  const acme = await db.organization.create({
    data: {
      name: "Acme Robotics",
      type: "company",
      description: "Warehouse robotics startup.",
      base: "South San Francisco, CA",
    },
  });
  const foodBank = await db.organization.create({
    data: {
      name: "Bay Area Food Bank",
      type: "nonprofit",
      description: "Community food bank; volunteer-run distribution.",
      base: "Oakland, CA",
    },
  });

  // 3. People (with nested contacts, important dates, notes).
  const sarah = await db.person.create({
    data: {
      name: "Sarah Chen",
      relationshipToMe: "partner",
      base: "San Francisco, CA",
      story:
        "My partner of six years. We met at a Stanford alumni mixer in 2019. Product designer, runs half-marathons, makes the best dumplings. We just welcomed our son Leo this spring.",
      interests: ["design", "running", "cooking", "photography"],
      contactMethods: {
        create: [
          { kind: "phone", value: "+1-415-555-0142", label: "personal" },
          { kind: "email", value: "sarah.chen@example.com", label: "personal" },
          { kind: "instagram", value: "@sarahmakesdumplings" },
        ],
      },
      importantDates: {
        create: [
          { label: "Birthday", date: d("1991-03-03"), recurring: true },
          // Anniversary lands in the Today window.
          { label: "Anniversary", date: d("2019-06-02"), recurring: true },
        ],
      },
      notes: {
        create: [
          {
            body: "Just had our baby — Leo, born April 18. Sleep is nonexistent but she's glowing.",
            pinned: true,
            createdAt: t("2026-05-20T09:00:00.000Z"),
          },
          {
            body: "Loves oat-milk flat whites. Allergic to shellfish — important for dinner plans.",
            pinned: true,
            createdAt: t("2026-01-12T17:30:00.000Z"),
          },
          {
            body: "Training for the SF half-marathon in the fall, slowly getting back into it.",
            createdAt: t("2026-05-10T08:15:00.000Z"),
          },
        ],
      },
    },
  });

  const linda = await db.person.create({
    data: {
      name: "Linda Martinez",
      relationshipToMe: "family",
      base: "San Diego, CA",
      story:
        "My mom. Retired schoolteacher, lives in San Diego with a garden she's very proud of. Calls every Sunday.",
      interests: ["gardening", "bridge", "true crime podcasts"],
      contactMethods: {
        create: [
          { kind: "phone", value: "+1-619-555-0199", label: "mobile" },
          { kind: "email", value: "linda.martinez@example.com" },
        ],
      },
      importantDates: {
        create: [{ label: "Birthday", date: d("1958-09-14"), recurring: true }],
      },
      notes: {
        create: [
          {
            body: "Knee surgery scheduled for July — check in before and after.",
            pinned: true,
            createdAt: t("2026-05-15T19:00:00.000Z"),
          },
          {
            body: "Wants to do a family trip to Santa Fe this year. Asked me to look at dates.",
            createdAt: t("2026-04-02T15:00:00.000Z"),
          },
        ],
      },
    },
  });

  const david = await db.person.create({
    data: {
      name: "David Park",
      relationshipToMe: "close friend",
      base: "San Francisco, CA",
      story:
        "One of my closest friends. We met at the running club and now we're each other's accountability partner for early-morning workouts. Works in fintech.",
      interests: ["running", "coffee", "investing", "board games"],
      contactMethods: {
        create: [
          { kind: "phone", value: "+1-415-555-0177", label: "mobile" },
          { kind: "email", value: "david.park@example.com" },
          { kind: "x", value: "@dparkruns" },
        ],
      },
      importantDates: {
        // Birthday lands in the Today window (tomorrow).
        create: [{ label: "Birthday", date: d("1990-05-31"), recurring: true }],
      },
      notes: {
        create: [
          {
            body: "Just got engaged to Mina! Proposed in Big Sur over the long weekend.",
            pinned: true,
            createdAt: t("2026-05-26T21:00:00.000Z"),
          },
          {
            body: "Training for the SF Marathon in July. Targeting a sub-4 finish.",
            createdAt: t("2026-05-01T07:00:00.000Z"),
          },
          {
            body: "Big into Catan and Wingspan — hosts game night roughly monthly.",
            createdAt: t("2026-02-18T20:00:00.000Z"),
          },
        ],
      },
    },
  });

  const tom = await db.person.create({
    data: {
      name: "Tom Whitfield",
      relationshipToMe: "friend",
      base: "Oakland, CA",
      story:
        "Friend from the gym / running club. Easygoing, always up for a trail run. Works as a physical therapist.",
      interests: ["trail running", "climbing", "craft beer"],
      contactMethods: {
        create: [
          { kind: "phone", value: "+1-510-555-0123", label: "mobile" },
          { kind: "instagram", value: "@tomwhitruns" },
        ],
      },
      importantDates: {
        // Birthday lands in the Today window (end of window).
        create: [{ label: "Birthday", date: d("1992-06-06"), recurring: true }],
      },
      notes: {
        create: [
          {
            body: "Recommended a great PT for Sarah's running. Owes me a trail-run rain check.",
            createdAt: t("2026-05-12T18:00:00.000Z"),
          },
          {
            body: "Trying to plan a Yosemite climbing weekend in the fall.",
            createdAt: t("2026-04-22T12:30:00.000Z"),
          },
        ],
      },
    },
  });

  const priya = await db.person.create({
    data: {
      name: "Priya Nair",
      relationshipToMe: "colleague",
      base: "San Francisco, CA",
      story:
        "Teammate at Anthropic and a good friend. Sharp engineer, mentors a lot of the newer folks. We grab lunch most weeks.",
      interests: ["machine learning", "rock climbing", "south indian cooking", "sci-fi"],
      contactMethods: {
        create: [
          { kind: "email", value: "priya.nair@example.com", label: "work" },
          { kind: "linkedin", value: "https://linkedin.com/in/priyanair" },
          { kind: "phone", value: "+1-415-555-0188", label: "mobile" },
        ],
      },
      importantDates: {
        // Birthday lands in the Today window.
        create: [{ label: "Birthday", date: d("1989-06-04"), recurring: true }],
      },
      notes: {
        create: [
          {
            body: "Leading the inference-latency project this quarter. Loves a good design doc.",
            pinned: true,
            createdAt: t("2026-05-18T16:00:00.000Z"),
          },
          {
            body: "Vegetarian. Makes incredible dosas — promised to teach me sometime.",
            createdAt: t("2026-03-30T13:00:00.000Z"),
          },
        ],
      },
    },
  });

  const james = await db.person.create({
    data: {
      name: "James O'Connor",
      relationshipToMe: "mentor",
      base: "Palo Alto, CA",
      story:
        "My longtime mentor. Founded Acme Robotics; I worked for him early in my career and he still gives the best advice over coffee. Generous with intros.",
      interests: ["robotics", "sailing", "history", "mentoring"],
      contactMethods: {
        create: [
          { kind: "email", value: "james.oconnor@example.com" },
          { kind: "linkedin", value: "https://linkedin.com/in/jamesoconnor" },
        ],
      },
      importantDates: {
        // Work anniversary lands in the Today window.
        create: [
          { label: "Work anniversary", date: d("2014-06-01"), recurring: true },
          { label: "Birthday", date: d("1968-11-09"), recurring: true },
        ],
      },
      notes: {
        create: [
          {
            body: "Offered to introduce me to a VC for the side project. Follow up — he hates loose ends.",
            pinned: true,
            createdAt: t("2026-05-22T10:00:00.000Z"),
          },
          {
            body: "Sails out of the marina most weekends. Big on long-term thinking.",
            createdAt: t("2026-02-05T11:00:00.000Z"),
          },
        ],
      },
    },
  });

  const emma = await db.person.create({
    data: {
      name: "Emma Schmidt",
      relationshipToMe: "close friend",
      base: "Berkeley, CA",
      story:
        "Close friend since college. Pediatric nurse, big heart, volunteers at the food bank. The friend who always remembers everyone's birthday.",
      interests: ["hiking", "pottery", "volunteering", "baking"],
      contactMethods: {
        create: [
          { kind: "phone", value: "+1-510-555-0166", label: "mobile" },
          { kind: "email", value: "emma.schmidt@example.com" },
          { kind: "instagram", value: "@emmamakespots" },
        ],
      },
      importantDates: {
        // Birthday lands in the Today window.
        create: [{ label: "Birthday", date: d("1991-06-05"), recurring: true }],
      },
      notes: {
        create: [
          {
            body: "Hosting her birthday dinner on the 5th at her place in Berkeley. Bringing wine.",
            pinned: true,
            createdAt: t("2026-05-24T14:00:00.000Z"),
          },
          {
            body: "Started a pottery class — has been gifting everyone handmade mugs.",
            createdAt: t("2026-03-15T17:00:00.000Z"),
          },
        ],
      },
    },
  });

  const carlos = await db.person.create({
    data: {
      name: "Carlos Rivera",
      relationshipToMe: "family",
      base: "Oakland, CA",
      story:
        "My younger brother. Just bought his first place in Oakland. Works as a chef; we trade recipes constantly.",
      interests: ["cooking", "cycling", "vinyl records"],
      contactMethods: {
        create: [
          { kind: "phone", value: "+1-510-555-0111", label: "mobile" },
          { kind: "instagram", value: "@chefcarlosr" },
        ],
      },
      importantDates: {
        create: [{ label: "Birthday", date: d("1994-08-27"), recurring: true }],
      },
      notes: {
        create: [
          {
            body: "Just bought a house in Oakland — threw a great housewarming in March.",
            createdAt: t("2026-03-22T22:00:00.000Z"),
          },
          {
            body: "Opening a pop-up dinner series this summer. Wants family there for the first night.",
            createdAt: t("2026-05-08T19:00:00.000Z"),
          },
        ],
      },
    },
  });

  const aisha = await db.person.create({
    data: {
      name: "Aisha Khan",
      relationshipToMe: "colleague",
      base: "San Francisco, CA",
      story:
        "Colleague at Anthropic on the platform team. Joined last year; we've been pairing a lot. Dry sense of humor, excellent code reviews.",
      interests: ["distributed systems", "cycling", "tea", "chess"],
      contactMethods: {
        create: [
          { kind: "email", value: "aisha.khan@example.com", label: "work" },
          { kind: "linkedin", value: "https://linkedin.com/in/aishakhan" },
        ],
      },
      importantDates: {
        create: [{ label: "Birthday", date: d("1993-10-02"), recurring: true }],
      },
      notes: {
        create: [
          {
            body: "Onboarded onto the API gateway. Prefers async — Slack over meetings.",
            createdAt: t("2026-05-06T15:30:00.000Z"),
          },
          {
            body: "Plays competitive chess on weekends; rated around 1900.",
            createdAt: t("2026-04-14T16:45:00.000Z"),
          },
        ],
      },
    },
  });

  const noah = await db.person.create({
    data: {
      name: "Noah Bennett",
      relationshipToMe: "friend",
      base: "San Francisco, CA",
      story:
        "Friend from the running club. Photographer by trade, shoots a lot of our group runs and trips. Quietly hilarious.",
      interests: ["photography", "running", "surfing"],
      contactMethods: {
        create: [
          { kind: "email", value: "noah.bennett@example.com" },
          { kind: "website", value: "https://noahbennett.photo" },
          { kind: "instagram", value: "@noahshoots" },
        ],
      },
      importantDates: {
        create: [{ label: "Birthday", date: d("1990-12-19"), recurring: true }],
      },
      notes: {
        create: [
          {
            body: "Shot photos at the last group long run — said he'd send the gallery link.",
            createdAt: t("2026-05-25T11:00:00.000Z"),
          },
          {
            body: "Wants to do a sunrise surf-and-shoot at Ocean Beach sometime.",
            createdAt: t("2026-04-19T07:30:00.000Z"),
          },
        ],
      },
    },
  });

  const yuki = await db.person.create({
    data: {
      name: "Yuki Tanaka",
      relationshipToMe: "friend",
      base: "Tokyo, Japan",
      story:
        "College friend from Stanford, now back in Tokyo working in UX. We catch up on long video calls and whenever travel lines up.",
      interests: ["ux design", "cycling", "ramen", "city pop"],
      contactMethods: {
        create: [
          { kind: "email", value: "yuki.tanaka@example.com" },
          { kind: "x", value: "@yukidesigns" },
          { kind: "telegram", value: "@yukit" },
        ],
      },
      importantDates: {
        create: [{ label: "Birthday", date: d("1991-07-22"), recurring: true }],
      },
      notes: {
        create: [
          {
            body: "Coming to SF in September for a conference — wants to meet up.",
            pinned: true,
            createdAt: t("2026-05-11T09:30:00.000Z"),
          },
          {
            body: "Sent me a list of must-try ramen spots for the next Tokyo trip.",
            createdAt: t("2026-01-20T12:00:00.000Z"),
          },
        ],
      },
    },
  });

  const grace = await db.person.create({
    data: {
      name: "Grace Liu",
      relationshipToMe: "friend",
      base: "South San Francisco, CA",
      story:
        "Friend and fellow builder; engineering lead at Acme Robotics, where James introduced us. We trade notes on hard technical problems.",
      interests: ["robotics", "machine learning", "tennis", "espresso"],
      contactMethods: {
        create: [
          { kind: "email", value: "grace.liu@example.com" },
          { kind: "linkedin", value: "https://linkedin.com/in/graceliu" },
          { kind: "phone", value: "+1-650-555-0144", label: "mobile" },
        ],
      },
      importantDates: {
        create: [{ label: "Birthday", date: d("1988-02-11"), recurring: true }],
      },
      notes: {
        create: [
          {
            body: "Exploring a possible collaboration on a perception model. Wants to scope it soon.",
            pinned: true,
            createdAt: t("2026-05-19T16:30:00.000Z"),
          },
          {
            body: "Plays tennis on Sunday mornings; looking for a doubles partner.",
            createdAt: t("2026-04-28T10:00:00.000Z"),
          },
        ],
      },
    },
  });

  // 4. Person ↔ organization links.
  await db.personOrganization.createMany({
    data: [
      { personId: priya.id, orgId: anthropic.id, relationship: "works at", role: "Staff Engineer" },
      { personId: aisha.id, orgId: anthropic.id, relationship: "works at", role: "Software Engineer" },
      { personId: sarah.id, orgId: stanford.id, relationship: "studied at", role: "MS, Design" },
      { personId: yuki.id, orgId: stanford.id, relationship: "studied at", role: "BS, HCI" },
      { personId: david.id, orgId: ggRunners.id, relationship: "member of", role: "Pace leader" },
      { personId: tom.id, orgId: ggRunners.id, relationship: "member of" },
      { personId: noah.id, orgId: ggRunners.id, relationship: "member of", role: "Club photographer" },
      { personId: james.id, orgId: acme.id, relationship: "founder of", role: "Founder & CEO" },
      { personId: grace.id, orgId: acme.id, relationship: "works at", role: "Engineering Lead" },
      { personId: emma.id, orgId: foodBank.id, relationship: "volunteers at", role: "Volunteer" },
    ],
  });

  // 5. Shared, multi-person moments (a couple org-linked).
  const m1 = await db.moment.create({
    data: {
      title: "Tahoe ski weekend",
      description:
        "Long-weekend ski trip to Tahoe — bluebird days, a lot of hot chocolate, Sarah out-skied everyone.",
      place: "Lake Tahoe, CA",
      occurredAt: d("2026-02-14"),
    },
  });
  await db.momentPerson.createMany({
    data: [
      { momentId: m1.id, personId: sarah.id },
      { momentId: m1.id, personId: david.id },
      { momentId: m1.id, personId: emma.id },
    ],
  });

  const m2 = await db.moment.create({
    data: {
      title: "Anthropic team offsite",
      description:
        "Team offsite in wine country — strategy in the morning, a long hike in the afternoon.",
      place: "Sonoma, CA",
      occurredAt: d("2026-04-10"),
      orgId: anthropic.id,
    },
  });
  await db.momentPerson.createMany({
    data: [
      { momentId: m2.id, personId: priya.id },
      { momentId: m2.id, personId: aisha.id },
    ],
  });

  const m3 = await db.moment.create({
    data: {
      title: "Saturday long run",
      description: "12-miler along the bay with the running club, breakfast burritos after.",
      place: "Crissy Field, San Francisco",
      occurredAt: d("2026-05-24"),
      orgId: ggRunners.id,
    },
  });
  await db.momentPerson.createMany({
    data: [
      { momentId: m3.id, personId: david.id },
      { momentId: m3.id, personId: tom.id },
      { momentId: m3.id, personId: noah.id },
    ],
  });

  const m4 = await db.moment.create({
    data: {
      title: "Carlos's housewarming",
      description:
        "Carlos's housewarming for the new Oakland place — he cooked all night, Mom flew up for it.",
      place: "Oakland, CA",
      occurredAt: d("2026-03-21"),
    },
  });
  await db.momentPerson.createMany({
    data: [
      { momentId: m4.id, personId: carlos.id },
      { momentId: m4.id, personId: sarah.id },
      { momentId: m4.id, personId: linda.id },
    ],
  });

  const m5 = await db.moment.create({
    data: {
      title: "Founders dinner",
      description:
        "Dinner with James and the Acme crew — war stories, and James pushing me to start the side project.",
      place: "San Francisco, CA",
      occurredAt: d("2026-05-09"),
      orgId: acme.id,
    },
  });
  await db.momentPerson.createMany({
    data: [
      { momentId: m5.id, personId: james.id },
      { momentId: m5.id, personId: grace.id },
      { momentId: m5.id, personId: priya.id },
    ],
  });

  const m6 = await db.moment.create({
    data: {
      title: "Stanford reunion brunch",
      description: "Mini college reunion brunch when Yuki was in town — caught up with Emma too.",
      place: "Palo Alto, CA",
      occurredAt: d("2026-01-18"),
    },
  });
  await db.momentPerson.createMany({
    data: [
      { momentId: m6.id, personId: yuki.id },
      { momentId: m6.id, personId: emma.id },
    ],
  });

  // 6. Reminders — overdue, due today, upcoming (next 7 days), and a few done.
  await db.reminder.createMany({
    data: [
      // Overdue (dueAt < 2026-05-30).
      {
        personId: james.id,
        text: "Send James the VC intro he offered",
        dueAt: t("2026-05-27T17:00:00.000Z"),
        done: false,
      },
      {
        personId: linda.id,
        text: "Call Mom back about Father's Day plans",
        dueAt: t("2026-05-28T23:00:00.000Z"),
        done: false,
      },
      // Due today (2026-05-30).
      {
        personId: sarah.id,
        text: "Pick up the anniversary gift",
        dueAt: t("2026-05-30T18:00:00.000Z"),
        done: false,
      },
      {
        personId: david.id,
        text: "Confirm the birthday dinner reservation",
        dueAt: t("2026-05-30T21:00:00.000Z"),
        done: false,
      },
      // Upcoming (within the next 7 days).
      {
        personId: emma.id,
        text: "RSVP to Emma's birthday dinner",
        dueAt: t("2026-06-02T16:00:00.000Z"),
        done: false,
      },
      {
        personId: grace.id,
        text: "Scope the collaboration with Grace",
        dueAt: t("2026-06-03T17:00:00.000Z"),
        done: false,
      },
      {
        personId: priya.id,
        text: "Prep the 1:1 agenda for Priya",
        dueAt: t("2026-06-04T15:00:00.000Z"),
        done: false,
      },
      {
        personId: tom.id,
        text: "Buy Tom a birthday present",
        dueAt: t("2026-06-05T22:00:00.000Z"),
        done: false,
      },
      // Done (history).
      {
        personId: carlos.id,
        text: "Send Carlos a housewarming card",
        dueAt: t("2026-03-20T17:00:00.000Z"),
        done: true,
      },
      {
        personId: yuki.id,
        text: "Reply to Yuki's email about September",
        dueAt: t("2026-05-13T09:00:00.000Z"),
        done: true,
      },
      {
        personId: aisha.id,
        text: "Review Aisha's gateway PR",
        dueAt: t("2026-05-21T18:00:00.000Z"),
        done: true,
      },
    ],
  });
}

/** Allow running directly: `tsx prisma/seed.ts`. */
async function main() {
  await seed();
  const [people, orgs, moments, reminders] = await Promise.all([
    db.person.count(),
    db.organization.count(),
    db.moment.count(),
    db.reminder.count(),
  ]);
  console.log(
    `[seed] done — ${people} people, ${orgs} organizations, ${moments} moments, ${reminders} reminders.`,
  );
}

// Run only when executed directly (`tsx prisma/seed.ts`), not when imported
// by /api/admin/reset. `import.meta.url` matches the invoked script path.
const isDirectRun =
  typeof process !== "undefined" &&
  Array.isArray(process.argv) &&
  process.argv[1] !== undefined &&
  import.meta.url === `file://${process.argv[1]}`;

if (isDirectRun) {
  main()
    .then(async () => {
      await db.$disconnect();
    })
    .catch(async (err) => {
      console.error(err);
      await db.$disconnect();
      process.exit(1);
    });
}

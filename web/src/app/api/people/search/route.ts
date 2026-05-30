// LLM-powered people search.
//   GET /api/people/search?q=<question> → PersonSummary[]
//
// The search bar IS the LLM: given a natural-language question
// ("who lives in San Francisco", "who plays tennis", "who do I know in the
// USA"), Nemotron reasons over the whole directory and returns the matching
// people. Falls back to the substring filter (same fields as GET /api/people)
// on ANY LLM/parse error — search must never hard-fail.
import { NextResponse } from "next/server";
import type { PersonSummary } from "@/lib/types";
import { db } from "@/lib/db";
import { serializePersonSummary, toISODateTime } from "@/lib/serialize";

export const dynamic = "force-dynamic";

const SYS =
  "You filter people for a personal CRM. Given a directory (one person per line as '<id> | <name> | base: .. | interests: .. | relationship: ..') and the user's question, return ONLY a JSON array of the ids of people who match, e.g. [\"id1\",\"id2\"]. No prose, no markdown, no code fences. Empty array if none match. Reason about meaning, not just substrings (e.g. base 'San Francisco, CA' matches both 'San Francisco' and 'the USA'; interest 'tennis' matches 'who plays tennis').";

/** Same `include` as GET /api/people — soonest open reminder for nextReminderAt. */
const include = {
  reminders: {
    where: { done: false },
    orderBy: { dueAt: "asc" },
    take: 1,
  },
} as const;

type PersonWithReminder = Awaited<
  ReturnType<typeof db.person.findMany<{ include: typeof include }>>
>[number];

/** Map a person row → PersonSummary with its soonest open reminder. */
function toSummary(p: PersonWithReminder): PersonSummary {
  const next = p.reminders[0];
  return serializePersonSummary(p, next ? toISODateTime(next.dueAt) : null);
}

/** Substring filter over name / relationshipToMe / base / interests. */
function substringFilter(people: PersonWithReminder[], query: string): PersonWithReminder[] {
  const q = query.toLowerCase();
  return people.filter((p) => {
    if (p.name.toLowerCase().includes(q)) return true;
    if ((p.relationshipToMe ?? "").toLowerCase().includes(q)) return true;
    if ((p.base ?? "").toLowerCase().includes(q)) return true;
    return p.interests.some((i) => i.toLowerCase().includes(q));
  });
}

/** Parse the LLM content into a string[] of ids, robust to fences/prose. */
function parseIds(content: string): string[] {
  let text = content.trim();
  // Strip ``` / ```json fences if present.
  text = text.replace(/```(?:json)?/gi, "").trim();
  // Extract the first [ ... ] substring.
  const start = text.indexOf("[");
  const end = text.lastIndexOf("]");
  if (start === -1 || end === -1 || end < start) {
    throw new Error("no JSON array found in LLM response");
  }
  const parsed = JSON.parse(text.slice(start, end + 1));
  if (!Array.isArray(parsed)) throw new Error("LLM response is not an array");
  return parsed.map((x) => String(x));
}

/**
 * GET /api/people/search?q=
 * Empty q → all people sorted by name (identical to GET /api/people).
 * Non-empty q → LLM-filtered people in the LLM's order, with substring fallback.
 */
export async function GET(request: Request): Promise<NextResponse> {
  const url = new URL(request.url);
  const q = (url.searchParams.get("q") ?? "").trim();

  const people = await db.person.findMany({
    orderBy: { name: "asc" },
    include,
  });

  // Empty query → behave exactly like GET /api/people with no query.
  if (!q) {
    return NextResponse.json(people.map(toSummary));
  }

  try {
    const directory = people
      .map(
        (p) =>
          `${p.id} | ${p.name} | base: ${p.base ?? "unknown"} | interests: ${
            p.interests.length ? p.interests.join(", ") : "none"
          } | relationship: ${p.relationshipToMe ?? "unknown"}`,
      )
      .join("\n");

    const res = await fetch(`${process.env.NEMOTRON_LLM_URL}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.NEMOTRON_LLM_API_KEY}`,
      },
      body: JSON.stringify({
        model: process.env.NEMOTRON_LLM_MODEL,
        temperature: 0.1,
        max_tokens: 256,
        messages: [
          { role: "system", content: SYS },
          { role: "user", content: `Question: ${q}\n\nDirectory:\n${directory}` },
        ],
        chat_template_kwargs: { enable_thinking: false },
      }),
    });

    if (!res.ok) {
      throw new Error(`Nemotron returned ${res.status}`);
    }

    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = data.choices?.[0]?.message?.content;
    if (typeof content !== "string") {
      throw new Error("Nemotron response missing message content");
    }

    const ids = parseIds(content);
    const byId = new Map(people.map((p) => [p.id, p]));
    // Keep only ids present in the directory; preserve the LLM's order.
    const matches: PersonSummary[] = [];
    for (const id of ids) {
      const p = byId.get(id);
      if (p) matches.push(toSummary(p));
    }
    return NextResponse.json(matches);
  } catch (err) {
    console.warn(
      `[people/search] LLM search failed, falling back to substring filter: ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
    return NextResponse.json(substringFilter(people, q).map(toSummary));
  }
}

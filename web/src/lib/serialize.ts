/**
 * PRM Voice — Prisma row → DTO serializers.
 *
 * The Prisma client returns rows with `Date` objects and (for `@db.Date`
 * columns) UTC-midnight `Date`s. The wire DTOs in `src/lib/types.ts` use
 * ISO-8601 **strings**: full datetimes for `@db.Timestamptz` columns and
 * `"YYYY-MM-DD"` for date-only columns. These helpers do that conversion in
 * one place so every route handler returns identical, contract-exact shapes.
 *
 * Date handling notes:
 *   - Timestamptz columns (createdAt, updatedAt, dueAt) → `Date.toISOString()`
 *     (full UTC ISO datetime).
 *   - Date-only columns (ImportantDate.date, Moment.occurredAt) are stored at
 *     UTC midnight by Postgres/Prisma, so we slice the **UTC** date part
 *     (`toISOString().slice(0, 10)`) to avoid any local-timezone day shift.
 */
import type {
  ContactMethod as ContactMethodRow,
  ImportantDate as ImportantDateRow,
  Moment as MomentRow,
  Note as NoteRow,
  Organization as OrganizationRow,
  Person as PersonRow,
  PersonOrganization as PersonOrganizationRow,
  Reminder as ReminderRow,
} from "@/generated/prisma/client";
import type {
  ContactKind,
  ContactMethod,
  ImportantDate,
  ImportantDateWithPerson,
  Moment,
  MomentWithPeople,
  Note,
  Organization,
  Person,
  PersonDetail,
  PersonOrganization,
  PersonOrganizationLink,
  PersonSummary,
  Reminder,
  ReminderWithPerson,
} from "@/lib/types";

// ---------------------------------------------------------------------------
// Date helpers
// ---------------------------------------------------------------------------

/** Timestamptz `Date` → full ISO-8601 datetime string. */
export function toISODateTime(d: Date): string {
  return d.toISOString();
}

/**
 * Date-only `Date` (stored at UTC midnight) → `"YYYY-MM-DD"`.
 * Uses the UTC date part so the calendar day never shifts with local tz.
 */
export function toISODate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// Scalar entity serializers
// ---------------------------------------------------------------------------

export function serializePerson(p: PersonRow): Person {
  return {
    id: p.id,
    name: p.name,
    avatarUrl: p.avatarUrl,
    relationshipToMe: p.relationshipToMe,
    story: p.story,
    base: p.base,
    interests: p.interests,
    createdAt: toISODateTime(p.createdAt),
    updatedAt: toISODateTime(p.updatedAt),
  };
}

export function serializeContactMethod(c: ContactMethodRow): ContactMethod {
  return {
    id: c.id,
    personId: c.personId,
    kind: c.kind as ContactKind,
    value: c.value,
    label: c.label,
  };
}

export function serializeImportantDate(d: ImportantDateRow): ImportantDate {
  return {
    id: d.id,
    personId: d.personId,
    label: d.label,
    date: toISODate(d.date),
    recurring: d.recurring,
  };
}

export function serializeNote(n: NoteRow): Note {
  return {
    id: n.id,
    personId: n.personId,
    body: n.body,
    pinned: n.pinned,
    createdAt: toISODateTime(n.createdAt),
  };
}

export function serializeOrganization(o: OrganizationRow): Organization {
  return {
    id: o.id,
    name: o.name,
    type: o.type,
    description: o.description,
    base: o.base,
    createdAt: toISODateTime(o.createdAt),
    updatedAt: toISODateTime(o.updatedAt),
  };
}

export function serializePersonOrganization(po: PersonOrganizationRow): PersonOrganization {
  return {
    id: po.id,
    personId: po.personId,
    orgId: po.orgId,
    relationship: po.relationship,
    role: po.role,
  };
}

export function serializeMoment(m: MomentRow): Moment {
  return {
    id: m.id,
    title: m.title,
    description: m.description,
    place: m.place,
    occurredAt: m.occurredAt ? toISODate(m.occurredAt) : null,
    orgId: m.orgId,
    createdAt: toISODateTime(m.createdAt),
  };
}

export function serializeReminder(r: ReminderRow): Reminder {
  return {
    id: r.id,
    personId: r.personId,
    text: r.text,
    dueAt: toISODateTime(r.dueAt),
    done: r.done,
    createdAt: toISODateTime(r.createdAt),
  };
}

// ---------------------------------------------------------------------------
// Composite serializers
// ---------------------------------------------------------------------------

/**
 * Build a {@link PersonSummary}. `nextReminderAt` is the caller-supplied
 * soonest open reminder `dueAt` (already an ISO string), or null/omitted.
 */
export function serializePersonSummary(
  p: PersonRow,
  nextReminderAt?: string | null,
): PersonSummary {
  return {
    id: p.id,
    name: p.name,
    avatarUrl: p.avatarUrl,
    relationshipToMe: p.relationshipToMe,
    base: p.base,
    nextReminderAt: nextReminderAt ?? null,
  };
}

/** A person-organization join row with its org expanded → {@link PersonOrganizationLink}. */
export function serializePersonOrganizationLink(
  po: PersonOrganizationRow & { organization: OrganizationRow },
): PersonOrganizationLink {
  return {
    id: po.id,
    org: serializeOrganization(po.organization),
    relationship: po.relationship,
    role: po.role,
  };
}

/**
 * A moment with its participants (via the `momentPeople` join) and optional
 * org expanded → {@link MomentWithPeople}. Participants are returned as bare
 * {@link PersonSummary} (no per-person reminder lookup — `nextReminderAt`
 * stays null on embeds).
 */
export function serializeMomentWithPeople(
  m: MomentRow & {
    organization: OrganizationRow | null;
    momentPeople: Array<{ person: PersonRow }>;
  },
): MomentWithPeople {
  return {
    ...serializeMoment(m),
    people: m.momentPeople.map((mp) => serializePersonSummary(mp.person)),
    organization: m.organization ? serializeOrganization(m.organization) : null,
  };
}

/** A reminder with its person summary expanded → {@link ReminderWithPerson}. */
export function serializeReminderWithPerson(
  r: ReminderRow & { person: PersonRow },
): ReminderWithPerson {
  return {
    ...serializeReminder(r),
    person: serializePersonSummary(r.person),
  };
}

/** An important date with its person summary expanded → {@link ImportantDateWithPerson}. */
export function serializeImportantDateWithPerson(
  d: ImportantDateRow & { person: PersonRow },
): ImportantDateWithPerson {
  return {
    ...serializeImportantDate(d),
    person: serializePersonSummary(d.person),
  };
}

/**
 * Assemble a full {@link PersonDetail} from a person row plus its already
 * ordered relation rows. Ordering decisions (notes pinned-first, reminders
 * open-first, moments newest-first) are the caller's responsibility — this
 * just maps. `organizations` rows must include their `organization`; `moments`
 * rows must include `organization` + `momentPeople.person`.
 */
export function serializePersonDetail(
  p: PersonRow & {
    contactMethods: ContactMethodRow[];
    importantDates: ImportantDateRow[];
    notes: NoteRow[];
    personOrganizations: Array<PersonOrganizationRow & { organization: OrganizationRow }>;
    reminders: ReminderRow[];
  },
  moments: Array<
    MomentRow & {
      organization: OrganizationRow | null;
      momentPeople: Array<{ person: PersonRow }>;
    }
  >,
): PersonDetail {
  return {
    ...serializePerson(p),
    contacts: p.contactMethods.map(serializeContactMethod),
    importantDates: p.importantDates.map(serializeImportantDate),
    notes: p.notes.map(serializeNote),
    organizations: p.personOrganizations.map(serializePersonOrganizationLink),
    moments: moments.map(serializeMomentWithPeople),
    reminders: p.reminders.map(serializeReminder),
  };
}

/**
 * PRM Voice — shared DTO types.
 *
 * Clean, transport-friendly shapes for every entity in the data model
 * (design spec §4). These are the JSON shapes the API returns and the
 * client consumes — distinct from the Prisma models (snake_case columns,
 * `Date` objects). All timestamps/dates here are ISO-8601 **strings** so
 * they round-trip through JSON without manual (de)serialization.
 *
 * These types are the contract surface for the whole web app and the
 * voice server's API client. Keep them in sync with:
 *   - prisma/schema.prisma   (the persisted shape)
 *   - src/lib/api-contract.ts (the REST envelope + fetch client)
 */

/** ISO-8601 datetime string, e.g. "2026-05-30T12:00:00.000Z". */
export type ISODateTime = string;
/** ISO-8601 date string (no time), e.g. "2026-03-03". */
export type ISODate = string;
/** A UUID v4 string. */
export type UUID = string;

/** contact_methods.kind — flexible contact channel. */
export type ContactKind =
  | "phone"
  | "email"
  | "website"
  | "linkedin"
  | "instagram"
  | "x"
  | "whatsapp"
  | "telegram"
  | "other";

/** organizations.type — lightweight org categorization. */
export type OrganizationType =
  | "company"
  | "school"
  | "club"
  | "nonprofit"
  | "family"
  | "other";

/** A person — the core entity. Birthday lives in `importantDates`, not here. */
export interface Person {
  id: UUID;
  name: string;
  avatarUrl: string | null;
  relationshipToMe: string | null;
  story: string | null;
  base: string | null;
  interests: string[];
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

/** A contact handle attached to a person. */
export interface ContactMethod {
  id: UUID;
  personId: UUID;
  kind: ContactKind;
  value: string;
  label: string | null;
}

/** An important date (birthday, anniversary, …). Feeds the Today surface. */
export interface ImportantDate {
  id: UUID;
  personId: UUID;
  label: string;
  date: ISODate;
  recurring: boolean;
}

/** A timestamped note about a person. */
export interface Note {
  id: UUID;
  personId: UUID;
  body: string;
  pinned: boolean;
  createdAt: ISODateTime;
}

/** A lightweight organization. */
export interface Organization {
  id: UUID;
  name: string;
  type: OrganizationType | string | null;
  description: string | null;
  base: string | null;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

/** The join row linking a person to an organization with a relationship. */
export interface PersonOrganization {
  id: UUID;
  personId: UUID;
  orgId: UUID;
  relationship: string | null;
  role: string | null;
}

/** A shared, multi-person moment ("where / who / description"). */
export interface Moment {
  id: UUID;
  title: string | null;
  description: string;
  place: string | null;
  occurredAt: ISODate | null;
  orgId: UUID | null;
  createdAt: ISODateTime;
}

/** A manual follow-up reminder for a person. */
export interface Reminder {
  id: UUID;
  personId: UUID;
  text: string;
  dueAt: ISODateTime;
  done: boolean;
  createdAt: ISODateTime;
}

// ---------------------------------------------------------------------------
// Composite / derived shapes
// ---------------------------------------------------------------------------

/**
 * An organization as rendered on a person: the org plus this person's
 * relationship + role to it. Used in {@link PersonDetail.organizations}.
 */
export interface PersonOrganizationLink {
  /** The join-row id, used by `DELETE /api/person-organizations/:id`. */
  id: UUID;
  org: Organization;
  relationship: string | null;
  role: string | null;
}

/**
 * A moment as rendered on a person's timeline: the moment plus its
 * co-participants and optional org.
 */
export interface MomentWithPeople extends Moment {
  people: PersonSummary[];
  organization: Organization | null;
}

/** A reminder enriched with a summary of its person (for cross-person lists). */
export interface ReminderWithPerson extends Reminder {
  person: PersonSummary;
}

/** An important date enriched with a summary of its person (for the Today surface). */
export interface ImportantDateWithPerson extends ImportantDate {
  person: PersonSummary;
}

/**
 * A person's full record (design spec §4):
 * people + contact_methods + important_dates + notes + linked
 * organizations + moments they're in + reminders.
 */
export interface PersonDetail extends Person {
  contacts: ContactMethod[];
  importantDates: ImportantDate[];
  notes: Note[];
  organizations: PersonOrganizationLink[];
  moments: MomentWithPeople[];
  reminders: Reminder[];
}

/** The compact person shape for list rows, search results, and embeds. */
export interface PersonSummary {
  id: UUID;
  name: string;
  avatarUrl: string | null;
  relationshipToMe: string | null;
  base: string | null;
  /** Soonest upcoming reminder due date, if any — drives the list badge. */
  nextReminderAt?: ISODateTime | null;
}

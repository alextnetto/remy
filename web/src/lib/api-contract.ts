/**
 * PRM Voice — REST API contract + typed fetch client.
 *
 * This file is the single source of truth for the HTTP surface that:
 *   - the Next.js route handlers under `src/app/api/**` implement,
 *   - the web UI calls via {@link api},
 *   - the Python voice server mirrors in `server/prm/api_client.py`.
 *
 * Every endpoint is JSON, lives under `/api`, and is encoded below as:
 *   1. a request-body type (for POST/PATCH), and
 *   2. a function on the {@link api} client returning a typed Promise.
 *
 * Base URL comes from `NEXT_PUBLIC_API_BASE_URL` (default `""`, i.e.
 * same-origin relative requests — correct for the Next.js app itself).
 * The voice server points its own client at this app's origin.
 *
 * Keep request/response shapes in lockstep with `src/lib/types.ts`.
 */

import type {
  ContactKind,
  ContactMethod,
  ImportantDate,
  ImportantDateWithPerson,
  Moment,
  MomentWithPeople,
  Note,
  Organization,
  OrganizationType,
  Person,
  PersonDetail,
  PersonOrganization,
  PersonSummary,
  Reminder,
  ReminderWithPerson,
  UUID,
} from "./types";

// ---------------------------------------------------------------------------
// Shared envelopes
// ---------------------------------------------------------------------------

/** Standard success envelope for delete/mutation endpoints that return no entity. */
export interface OkResponse {
  ok: true;
}

/** `GET /api/reminders` filter values. */
export type ReminderFilter = "today" | "overdue" | "upcoming" | "all";

// ---------------------------------------------------------------------------
// Request body types
// ---------------------------------------------------------------------------

/** Body for `POST /api/people`. */
export interface CreatePersonBody {
  name: string;
  relationshipToMe?: string;
  base?: string;
  story?: string;
  interests?: string[];
}

/** Body for `PATCH /api/people/:id` — all fields optional (partial update). */
export interface UpdatePersonBody {
  name?: string;
  avatarUrl?: string | null;
  relationshipToMe?: string | null;
  base?: string | null;
  story?: string | null;
  interests?: string[];
}

/** Body for `POST /api/people/:id/contacts`. */
export interface CreateContactBody {
  kind: ContactKind;
  value: string;
  label?: string;
}

/** Body for `POST /api/people/:id/dates`. */
export interface CreateImportantDateBody {
  label: string;
  /** ISO date, e.g. "2026-03-03". */
  date: string;
  recurring?: boolean;
}

/** Body for `POST /api/people/:id/notes`. */
export interface CreateNoteBody {
  body: string;
  pinned?: boolean;
}

/** Body for `POST /api/organizations` (find-or-create by name). */
export interface CreateOrganizationBody {
  name: string;
  type?: OrganizationType | string;
  description?: string;
  base?: string;
}

/** Body for `POST /api/people/:id/organizations` (find-or-create org + link). */
export interface LinkOrganizationBody {
  orgName: string;
  relationship?: string;
  role?: string;
}

/** Body for `POST /api/moments` (multi-person). */
export interface CreateMomentBody {
  description: string;
  personIds: UUID[];
  place?: string;
  /** ISO date the moment occurred. */
  occurredAt?: string;
  orgId?: UUID;
  title?: string;
}

/** Body for `POST /api/people/:id/reminders`. */
export interface CreateReminderBody {
  text: string;
  /** ISO datetime the reminder is due. */
  dueAt: string;
}

/** Response for `GET /api/today`. */
export interface TodayResponse {
  reminders: ReminderWithPerson[];
  importantDates: ImportantDateWithPerson[];
}

// ---------------------------------------------------------------------------
// Endpoint map (documentation of the full surface, as a type)
// ---------------------------------------------------------------------------

/**
 * The complete endpoint catalogue, keyed by `"<METHOD> <path>"`, describing
 * each endpoint's request body and response type. This is a reference /
 * compile-time index — the runtime client below implements each entry.
 */
export interface ApiContract {
  // People
  "GET /api/people": { query: { query?: string }; response: PersonSummary[] };
  "POST /api/people": { body: CreatePersonBody; response: Person };
  "GET /api/people/:id": { params: { id: UUID }; response: PersonDetail };
  "PATCH /api/people/:id": { params: { id: UUID }; body: UpdatePersonBody; response: Person };
  "DELETE /api/people/:id": { params: { id: UUID }; response: OkResponse };

  // Contacts
  "POST /api/people/:id/contacts": {
    params: { id: UUID };
    body: CreateContactBody;
    response: ContactMethod;
  };
  "DELETE /api/contacts/:id": { params: { id: UUID }; response: OkResponse };

  // Important dates
  "POST /api/people/:id/dates": {
    params: { id: UUID };
    body: CreateImportantDateBody;
    response: ImportantDate;
  };
  "DELETE /api/dates/:id": { params: { id: UUID }; response: OkResponse };

  // Notes
  "GET /api/people/:id/notes": { params: { id: UUID }; response: Note[] };
  "POST /api/people/:id/notes": { params: { id: UUID }; body: CreateNoteBody; response: Note };
  "DELETE /api/notes/:id": { params: { id: UUID }; response: OkResponse };

  // Organizations
  "GET /api/organizations": { query: { query?: string }; response: Organization[] };
  "POST /api/organizations": { body: CreateOrganizationBody; response: Organization };
  "POST /api/people/:id/organizations": {
    params: { id: UUID };
    body: LinkOrganizationBody;
    response: PersonOrganization;
  };
  "DELETE /api/person-organizations/:id": { params: { id: UUID }; response: OkResponse };

  // Moments
  "POST /api/moments": { body: CreateMomentBody; response: Moment };
  "GET /api/people/:id/moments": { params: { id: UUID }; response: MomentWithPeople[] };

  // Reminders
  "GET /api/reminders": { query: { filter?: ReminderFilter }; response: ReminderWithPerson[] };
  "POST /api/people/:id/reminders": {
    params: { id: UUID };
    body: CreateReminderBody;
    response: Reminder;
  };
  "POST /api/reminders/:id/complete": { params: { id: UUID }; response: Reminder };
  "DELETE /api/reminders/:id": { params: { id: UUID }; response: OkResponse };

  // Today
  "GET /api/today": { response: TodayResponse };

  // Admin
  "POST /api/admin/reset": { response: OkResponse };
}

// ---------------------------------------------------------------------------
// Typed fetch client
// ---------------------------------------------------------------------------

/** Base URL for API calls. Empty string = same-origin relative requests. */
export const API_BASE_URL: string = process.env.NEXT_PUBLIC_API_BASE_URL ?? "";

/** Thrown when an API call returns a non-2xx status. */
export class ApiError extends Error {
  readonly status: number;
  readonly body: unknown;
  constructor(status: number, message: string, body: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.body = body;
  }
}

type QueryParams = Record<string, string | number | boolean | undefined | null>;

function buildUrl(path: string, query?: QueryParams): string {
  const base = `${API_BASE_URL}${path}`;
  if (!query) return base;
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null && value !== "") {
      search.set(key, String(value));
    }
  }
  const qs = search.toString();
  return qs ? `${base}?${qs}` : base;
}

interface RequestOptions {
  query?: QueryParams;
  body?: unknown;
  signal?: AbortSignal;
}

async function request<T>(
  method: string,
  path: string,
  opts: RequestOptions = {},
): Promise<T> {
  const init: RequestInit = {
    method,
    headers: { "Content-Type": "application/json" },
    signal: opts.signal,
    // Always read fresh — this is a live shared world.
    cache: "no-store",
  };
  if (opts.body !== undefined) {
    init.body = JSON.stringify(opts.body);
  }

  const res = await fetch(buildUrl(path, opts.query), init);

  if (!res.ok) {
    let parsed: unknown = null;
    try {
      parsed = await res.json();
    } catch {
      // non-JSON error body; ignore
    }
    throw new ApiError(res.status, `${method} ${path} failed: ${res.status}`, parsed);
  }

  // 204 / empty body guard.
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

const enc = encodeURIComponent;

/**
 * Typed PRM API client. Every method maps 1:1 to an endpoint in
 * {@link ApiContract} and returns a typed Promise. Used by both the web UI
 * and (mirrored) by the voice server.
 */
export const api = {
  people: {
    /** `GET /api/people?query=` → PersonSummary[] */
    list: (query?: string, signal?: AbortSignal) =>
      request<PersonSummary[]>("GET", "/api/people", { query: { query }, signal }),
    /** `POST /api/people` → Person */
    create: (body: CreatePersonBody, signal?: AbortSignal) =>
      request<Person>("POST", "/api/people", { body, signal }),
    /** `GET /api/people/:id` → PersonDetail */
    get: (id: UUID, signal?: AbortSignal) =>
      request<PersonDetail>("GET", `/api/people/${enc(id)}`, { signal }),
    /** `PATCH /api/people/:id` → Person */
    update: (id: UUID, body: UpdatePersonBody, signal?: AbortSignal) =>
      request<Person>("PATCH", `/api/people/${enc(id)}`, { body, signal }),
    /** `DELETE /api/people/:id` → { ok: true } */
    remove: (id: UUID, signal?: AbortSignal) =>
      request<OkResponse>("DELETE", `/api/people/${enc(id)}`, { signal }),
  },

  contacts: {
    /** `POST /api/people/:id/contacts` → ContactMethod */
    create: (personId: UUID, body: CreateContactBody, signal?: AbortSignal) =>
      request<ContactMethod>("POST", `/api/people/${enc(personId)}/contacts`, { body, signal }),
    /** `DELETE /api/contacts/:id` → { ok: true } */
    remove: (id: UUID, signal?: AbortSignal) =>
      request<OkResponse>("DELETE", `/api/contacts/${enc(id)}`, { signal }),
  },

  dates: {
    /** `POST /api/people/:id/dates` → ImportantDate */
    create: (personId: UUID, body: CreateImportantDateBody, signal?: AbortSignal) =>
      request<ImportantDate>("POST", `/api/people/${enc(personId)}/dates`, { body, signal }),
    /** `DELETE /api/dates/:id` → { ok: true } */
    remove: (id: UUID, signal?: AbortSignal) =>
      request<OkResponse>("DELETE", `/api/dates/${enc(id)}`, { signal }),
  },

  notes: {
    /** `GET /api/people/:id/notes` → Note[] */
    list: (personId: UUID, signal?: AbortSignal) =>
      request<Note[]>("GET", `/api/people/${enc(personId)}/notes`, { signal }),
    /** `POST /api/people/:id/notes` → Note */
    create: (personId: UUID, body: CreateNoteBody, signal?: AbortSignal) =>
      request<Note>("POST", `/api/people/${enc(personId)}/notes`, { body, signal }),
    /** `DELETE /api/notes/:id` → { ok: true } */
    remove: (id: UUID, signal?: AbortSignal) =>
      request<OkResponse>("DELETE", `/api/notes/${enc(id)}`, { signal }),
  },

  organizations: {
    /** `GET /api/organizations?query=` → Organization[] */
    list: (query?: string, signal?: AbortSignal) =>
      request<Organization[]>("GET", "/api/organizations", { query: { query }, signal }),
    /** `POST /api/organizations` (find-or-create by name) → Organization */
    create: (body: CreateOrganizationBody, signal?: AbortSignal) =>
      request<Organization>("POST", "/api/organizations", { body, signal }),
    /** `POST /api/people/:id/organizations` (find-or-create org + link) → PersonOrganization */
    link: (personId: UUID, body: LinkOrganizationBody, signal?: AbortSignal) =>
      request<PersonOrganization>("POST", `/api/people/${enc(personId)}/organizations`, {
        body,
        signal,
      }),
    /** `DELETE /api/person-organizations/:id` → { ok: true } */
    unlink: (personOrganizationId: UUID, signal?: AbortSignal) =>
      request<OkResponse>("DELETE", `/api/person-organizations/${enc(personOrganizationId)}`, {
        signal,
      }),
  },

  moments: {
    /** `POST /api/moments` (multi-person) → Moment */
    create: (body: CreateMomentBody, signal?: AbortSignal) =>
      request<Moment>("POST", "/api/moments", { body, signal }),
    /** `GET /api/people/:id/moments` → MomentWithPeople[] */
    listForPerson: (personId: UUID, signal?: AbortSignal) =>
      request<MomentWithPeople[]>("GET", `/api/people/${enc(personId)}/moments`, { signal }),
  },

  reminders: {
    /** `GET /api/reminders?filter=...` → ReminderWithPerson[] */
    list: (filter?: ReminderFilter, signal?: AbortSignal) =>
      request<ReminderWithPerson[]>("GET", "/api/reminders", { query: { filter }, signal }),
    /** `POST /api/people/:id/reminders` → Reminder */
    create: (personId: UUID, body: CreateReminderBody, signal?: AbortSignal) =>
      request<Reminder>("POST", `/api/people/${enc(personId)}/reminders`, { body, signal }),
    /** `POST /api/reminders/:id/complete` → Reminder */
    complete: (id: UUID, signal?: AbortSignal) =>
      request<Reminder>("POST", `/api/reminders/${enc(id)}/complete`, { signal }),
    /** `DELETE /api/reminders/:id` → { ok: true } */
    remove: (id: UUID, signal?: AbortSignal) =>
      request<OkResponse>("DELETE", `/api/reminders/${enc(id)}`, { signal }),
  },

  /** `GET /api/today` → { reminders, importantDates } */
  today: (signal?: AbortSignal) => request<TodayResponse>("GET", "/api/today", { signal }),

  admin: {
    /** `POST /api/admin/reset` → { ok: true } */
    reset: (signal?: AbortSignal) =>
      request<OkResponse>("POST", "/api/admin/reset", { signal }),
  },
} as const;

export type Api = typeof api;

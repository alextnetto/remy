/**
 * Small presentation helpers shared across screens.
 * Pure functions — safe in both server and client components.
 */
import {
  format,
  formatDistanceToNowStrict,
  isPast,
  isToday,
  isTomorrow,
  parseISO,
} from "date-fns";

import type { ContactKind } from "@/lib/types";

/** Initials for the avatar fallback, e.g. "Sarah Chen" → "SC". */
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase();
}

/**
 * Deterministic warm/cool gradient class for a person, keyed off their id so
 * the avatar color is stable across renders and sessions.
 */
const AVATAR_GRADIENTS = [
  "from-rose-400 to-orange-400",
  "from-sky-400 to-indigo-500",
  "from-emerald-400 to-teal-500",
  "from-fuchsia-400 to-purple-500",
  "from-amber-400 to-pink-500",
  "from-cyan-400 to-blue-500",
  "from-violet-400 to-rose-400",
  "from-lime-400 to-emerald-500",
] as const;

export function avatarGradient(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  }
  return AVATAR_GRADIENTS[Math.abs(hash) % AVATAR_GRADIENTS.length]!;
}

/** Parse a value that may already be a Date or an ISO string. */
function toDate(value: string): Date {
  return parseISO(value);
}

/** Relative-ish label for a reminder/due timestamp ("Today", "Tomorrow", "in 3 days", "2d overdue"). */
export function dueLabel(iso: string): string {
  const d = toDate(iso);
  if (isToday(d)) return "Today";
  if (isTomorrow(d)) return "Tomorrow";
  if (isPast(d)) return `${formatDistanceToNowStrict(d)} overdue`;
  return `in ${formatDistanceToNowStrict(d)}`;
}

/** True when a reminder is overdue (due in the past and not today). */
export function isOverdue(iso: string): boolean {
  const d = toDate(iso);
  return isPast(d) && !isToday(d);
}

/** True when a date is "soon" — due/overdue or within `days` from now. */
export function isSoon(iso: string, days = 7): boolean {
  const d = toDate(iso);
  const now = new Date();
  const horizon = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
  return d <= horizon;
}

/** "Mar 3", "Mar 3, 2025" (only show year when not the current one). */
export function shortDate(iso: string): string {
  const d = toDate(iso);
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return format(d, sameYear ? "MMM d" : "MMM d, yyyy");
}

/** "Mar 3 · 2:30 PM" for reminder timestamps. */
export function dateTime(iso: string): string {
  return format(toDate(iso), "MMM d · h:mm a");
}

/** Relative timestamp for notes ("2h ago", "3d ago"). */
export function timeAgo(iso: string): string {
  return `${formatDistanceToNowStrict(toDate(iso))} ago`;
}

/**
 * Render an important date for display. Recurring dates (birthdays) drop the
 * year and append the next age/turn count is out of scope — just show day/month.
 */
export function importantDateLabel(iso: string, recurring: boolean): string {
  const d = toDate(iso);
  if (recurring) return format(d, "MMM d");
  return shortDate(iso);
}

// ---------------------------------------------------------------------------
// Contact helpers
// ---------------------------------------------------------------------------

/** Build a tappable href for a contact method. Returns null for non-linkable kinds. */
export function contactHref(kind: ContactKind, value: string): string | null {
  const v = value.trim();
  switch (kind) {
    case "phone":
    case "whatsapp":
      return `tel:${v.replace(/\s+/g, "")}`;
    case "email":
      return `mailto:${v}`;
    case "website":
      return /^https?:\/\//i.test(v) ? v : `https://${v}`;
    case "linkedin":
      return /^https?:\/\//i.test(v)
        ? v
        : `https://linkedin.com/in/${v.replace(/^@/, "")}`;
    case "instagram":
      return /^https?:\/\//i.test(v)
        ? v
        : `https://instagram.com/${v.replace(/^@/, "")}`;
    case "x":
      return /^https?:\/\//i.test(v)
        ? v
        : `https://x.com/${v.replace(/^@/, "")}`;
    case "telegram":
      return /^https?:\/\//i.test(v)
        ? v
        : `https://t.me/${v.replace(/^@/, "")}`;
    default:
      return /^https?:\/\//i.test(v) ? v : null;
  }
}

/** Human label for a contact kind. */
export const CONTACT_KIND_LABEL: Record<ContactKind, string> = {
  phone: "Phone",
  email: "Email",
  website: "Website",
  linkedin: "LinkedIn",
  instagram: "Instagram",
  x: "X",
  whatsapp: "WhatsApp",
  telegram: "Telegram",
  other: "Other",
};

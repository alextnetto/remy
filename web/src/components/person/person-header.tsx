"use client";

import { MapPin } from "lucide-react";

import { PersonAvatar } from "@/components/shared/person-avatar";
import { ContactIcon } from "@/components/shared/contact-icon";
import { Badge } from "@/components/ui/badge";
import { CONTACT_KIND_LABEL, contactHref } from "@/components/shared/format";
import { cn } from "@/lib/utils";
import type { ContactMethod, PersonDetail } from "@/lib/types";

/** Order in which to surface quick-contact actions in the header. */
const QUICK_ORDER: ContactMethod["kind"][] = [
  "phone",
  "whatsapp",
  "email",
  "telegram",
  "instagram",
  "x",
  "linkedin",
  "website",
];

function pickQuickContacts(contacts: ContactMethod[]): ContactMethod[] {
  const seen = new Set<string>();
  const out: ContactMethod[] = [];
  for (const kind of QUICK_ORDER) {
    const match = contacts.find((c) => c.kind === kind && !seen.has(c.id));
    if (match) {
      seen.add(match.id);
      out.push(match);
    }
    if (out.length >= 5) break;
  }
  return out;
}

export function PersonHeader({ person }: { person: PersonDetail }) {
  const quick = pickQuickContacts(person.contacts);

  return (
    <header className="flex flex-col items-center gap-3 px-4 pt-2 pb-1 text-center">
      <PersonAvatar
        id={person.id}
        name={person.name}
        avatarUrl={person.avatarUrl}
        size="lg"
        className="size-20 text-2xl"
      />

      <div className="space-y-1">
        <h1 className="font-heading text-2xl leading-tight font-semibold">
          {person.name}
        </h1>
        <div className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
          {person.relationshipToMe ? (
            <span className="capitalize">{person.relationshipToMe}</span>
          ) : null}
          {person.relationshipToMe && person.base ? (
            <span className="text-border">·</span>
          ) : null}
          {person.base ? (
            <span className="flex items-center gap-1">
              <MapPin className="size-3.5" />
              {person.base}
            </span>
          ) : null}
        </div>
      </div>

      {person.interests.length > 0 ? (
        <div className="flex flex-wrap justify-center gap-1.5">
          {person.interests.map((interest) => (
            <Badge key={interest} variant="secondary" className="font-normal">
              {interest}
            </Badge>
          ))}
        </div>
      ) : null}

      {quick.length > 0 ? (
        <div className="mt-1 flex items-center justify-center gap-2">
          {quick.map((c) => {
            const href = contactHref(c.kind, c.value);
            const label = `${CONTACT_KIND_LABEL[c.kind]}: ${c.value}`;
            const external = c.kind !== "phone" && c.kind !== "whatsapp" && c.kind !== "email";
            const className = cn(
              "flex size-10 items-center justify-center rounded-full bg-muted text-foreground/80 transition-colors hover:bg-primary hover:text-primary-foreground focus-visible:ring-3 focus-visible:ring-ring/40 focus-visible:outline-none",
            );
            return href ? (
              <a
                key={c.id}
                href={href}
                aria-label={label}
                title={label}
                className={className}
                {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
              >
                <ContactIcon kind={c.kind} className="size-4.5" />
              </a>
            ) : (
              <span key={c.id} aria-label={label} title={label} className={className}>
                <ContactIcon kind={c.kind} className="size-4.5" />
              </span>
            );
          })}
        </div>
      ) : null}
    </header>
  );
}

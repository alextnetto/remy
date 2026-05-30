"use client";

import { useRouter } from "next/navigation";
import { ChevronRight, MapPin } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { PersonAvatar } from "@/components/shared/person-avatar";
import { dueLabel, isOverdue } from "@/components/shared/format";
import { cn } from "@/lib/utils";
import type { PersonSummary } from "@/lib/types";

/** A tappable person row for the home list. */
export function PersonRow({ person }: { person: PersonSummary }) {
  const router = useRouter();
  const next = person.nextReminderAt ?? null;
  const overdue = next ? isOverdue(next) : false;

  return (
    <button
      type="button"
      data-highlight-id={person.id}
      onClick={() => router.push(`/people/${person.id}`)}
      className={cn(
        "group flex w-full items-center gap-3 rounded-2xl border border-transparent px-3 py-2.5 text-left transition-colors",
        "hover:bg-muted/70 active:bg-muted focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/40 focus-visible:outline-none",
      )}
    >
      <PersonAvatar
        id={person.id}
        name={person.name}
        avatarUrl={person.avatarUrl}
        size="lg"
      />

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate font-medium">{person.name}</span>
          {next ? (
            <Badge
              variant={overdue ? "destructive" : "secondary"}
              className="shrink-0"
            >
              {dueLabel(next)}
            </Badge>
          ) : null}
        </div>
        <div className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
          {person.relationshipToMe ? (
            <span className="truncate">{person.relationshipToMe}</span>
          ) : null}
          {person.relationshipToMe && person.base ? (
            <span className="text-border">·</span>
          ) : null}
          {person.base ? (
            <span className="flex min-w-0 items-center gap-0.5">
              <MapPin className="size-3 shrink-0" />
              <span className="truncate">{person.base}</span>
            </span>
          ) : null}
        </div>
      </div>

      <ChevronRight className="size-4 shrink-0 text-muted-foreground/50 transition-transform group-hover:translate-x-0.5" />
    </button>
  );
}

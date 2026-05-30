"use client";

import { useRouter } from "next/navigation";
import { CalendarHeart, Gift } from "lucide-react";

import { PersonAvatar } from "@/components/shared/person-avatar";
import { importantDateLabel } from "@/components/shared/format";
import { Badge } from "@/components/ui/badge";
import type { ImportantDateWithPerson } from "@/lib/types";

/** A row for an upcoming important date on the Reminders screen. */
export function UpcomingDateItem({ date }: { date: ImportantDateWithPerson }) {
  const router = useRouter();
  const isBirthday = /birthday/i.test(date.label);

  return (
    <button
      type="button"
      data-highlight-id={date.id}
      onClick={() => router.push(`/people/${date.person.id}`)}
      className="group flex w-full items-center gap-3 rounded-2xl border border-transparent px-3 py-2.5 text-left transition-colors hover:bg-muted/70 active:bg-muted focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/40 focus-visible:outline-none"
    >
      <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-600 dark:bg-amber-500/15 dark:text-amber-400">
        {isBirthday ? <Gift className="size-3.5" /> : <CalendarHeart className="size-3.5" />}
      </span>
      <PersonAvatar
        id={date.person.id}
        name={date.person.name}
        avatarUrl={date.person.avatarUrl}
        size="sm"
      />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{date.label}</p>
        <p className="truncate text-xs text-muted-foreground">{date.person.name}</p>
      </div>
      <Badge
        variant="secondary"
        className="shrink-0 bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300"
      >
        {importantDateLabel(date.date, date.recurring)}
      </Badge>
    </button>
  );
}

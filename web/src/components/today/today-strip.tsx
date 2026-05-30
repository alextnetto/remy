"use client";

import { useRouter } from "next/navigation";
import { Bell, CalendarHeart, ChevronRight, Gift } from "lucide-react";

import { Skeleton } from "@/components/ui/skeleton";
import { PersonAvatar } from "@/components/shared/person-avatar";
import {
  dueLabel,
  importantDateLabel,
  isOverdue,
} from "@/components/shared/format";
import { cn } from "@/lib/utils";
import type {
  ImportantDateWithPerson,
  ReminderWithPerson,
} from "@/lib/types";

interface TodayStripProps {
  reminders: ReminderWithPerson[];
  importantDates: ImportantDateWithPerson[];
  loading?: boolean;
}

/**
 * Horizontally-scrolling "Today" strip on the home screen: due/overdue
 * reminders + upcoming important dates as compact cards. Hidden entirely when
 * there's nothing to surface (after load).
 */
export function TodayStrip({
  reminders,
  importantDates,
  loading = false,
}: TodayStripProps) {
  const router = useRouter();

  if (loading) {
    return (
      <section className="px-4">
        <SectionLabel count={null} />
        <div className="flex gap-2.5 overflow-x-auto pb-1">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-[4.75rem] w-56 shrink-0 rounded-2xl" />
          ))}
        </div>
      </section>
    );
  }

  const total = reminders.length + importantDates.length;
  if (total === 0) return null;

  return (
    <section className="px-4">
      <SectionLabel count={total} />
      <div className="-mx-1 flex snap-x snap-mandatory gap-2.5 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {reminders.map((r) => {
          const overdue = isOverdue(r.dueAt);
          return (
            <TodayCard
              key={`r-${r.id}`}
              onClick={() => router.push(`/people/${r.person.id}`)}
              accent={overdue ? "destructive" : "primary"}
              icon={<Bell className="size-3.5" />}
              tag={dueLabel(r.dueAt)}
              person={r.person}
              title={r.text}
            />
          );
        })}
        {importantDates.map((d) => {
          const isBirthday = /birthday/i.test(d.label);
          return (
            <TodayCard
              key={`d-${d.id}`}
              onClick={() => router.push(`/people/${d.person.id}`)}
              accent="amber"
              icon={
                isBirthday ? (
                  <Gift className="size-3.5" />
                ) : (
                  <CalendarHeart className="size-3.5" />
                )
              }
              tag={importantDateLabel(d.date, d.recurring)}
              person={d.person}
              title={`${d.label} · ${d.person.name}`}
            />
          );
        })}
      </div>
    </section>
  );
}

function SectionLabel({ count }: { count: number | null }) {
  return (
    <div className="mb-2 flex items-baseline justify-between">
      <h2 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
        Today
      </h2>
      {count ? (
        <span className="text-xs text-muted-foreground">{count}</span>
      ) : null}
    </div>
  );
}

const ACCENTS = {
  primary: "text-primary",
  destructive: "text-destructive",
  amber: "text-amber-600 dark:text-amber-400",
} as const;

function TodayCard({
  onClick,
  accent,
  icon,
  tag,
  person,
  title,
}: {
  onClick: () => void;
  accent: keyof typeof ACCENTS;
  icon: React.ReactNode;
  tag: string;
  person: { id: string; name: string; avatarUrl: string | null };
  title: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex w-56 shrink-0 snap-start flex-col gap-2 rounded-2xl border border-border/70 bg-card p-3 text-left shadow-sm transition-colors hover:border-border hover:bg-muted/40 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/40 focus-visible:outline-none"
    >
      <div className="flex items-center justify-between">
        <span
          className={cn(
            "flex items-center gap-1 text-xs font-medium",
            ACCENTS[accent],
          )}
        >
          {icon}
          {tag}
        </span>
        <ChevronRight className="size-3.5 text-muted-foreground/40 transition-transform group-hover:translate-x-0.5" />
      </div>
      <div className="flex items-center gap-2">
        <PersonAvatar
          id={person.id}
          name={person.name}
          avatarUrl={person.avatarUrl}
          size="sm"
        />
        <span className="line-clamp-2 text-sm leading-snug font-medium">
          {title}
        </span>
      </div>
    </button>
  );
}

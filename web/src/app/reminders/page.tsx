"use client";

import * as React from "react";
import { BellOff, CalendarClock, CheckCircle2 } from "lucide-react";

import { AppHeader } from "@/components/shared/app-header";
import { EmptyState } from "@/components/shared/empty-state";
import { Segmented } from "@/components/shared/segmented";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { ReminderItem } from "@/components/reminders/reminder-item";
import { UpcomingDateItem } from "@/components/reminders/upcoming-date-item";
import {
  useHighlightTarget,
  useReportScreen,
  useVoiceRefresh,
} from "@/components/shared/use-voice-screen";
import { api } from "@/lib/api-contract";
import type { ReminderFilter } from "@/lib/api-contract";
import type { ImportantDateWithPerson, ReminderWithPerson } from "@/lib/types";
import type { ScreenReport } from "@/lib/voice-bridge";

const FILTERS: { value: ReminderFilter; label: string }[] = [
  { value: "today", label: "Today" },
  { value: "overdue", label: "Overdue" },
  { value: "upcoming", label: "Upcoming" },
  { value: "all", label: "All" },
];

export default function RemindersPage() {
  const [filter, setFilter] = React.useState<ReminderFilter>("today");
  const [reminders, setReminders] = React.useState<ReminderWithPerson[] | null>(
    null,
  );
  const [dates, setDates] = React.useState<ImportantDateWithPerson[]>([]);
  const [error, setError] = React.useState(false);

  useHighlightTarget();

  const fetchReminders = React.useCallback(
    async (f: ReminderFilter, signal?: AbortSignal) => {
      try {
        setError(false);
        const list = await api.reminders.list(f, signal);
        setReminders(list);
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setError(true);
      }
    },
    [],
  );

  // Upcoming important dates come from /today and are surfaced under the list.
  const fetchDates = React.useCallback(async () => {
    try {
      const t = await api.today();
      setDates(t.importantDates);
    } catch {
      setDates([]);
    }
  }, []);

  React.useEffect(() => {
    const ctrl = new AbortController();
    void (async () => {
      setReminders(null);
      await fetchReminders(filter, ctrl.signal);
    })();
    return () => ctrl.abort();
  }, [filter, fetchReminders]);

  React.useEffect(() => {
    void (async () => {
      await fetchDates();
    })();
  }, [fetchDates]);

  const refetch = React.useCallback(() => {
    fetchReminders(filter);
    fetchDates();
  }, [fetchReminders, fetchDates, filter]);
  useVoiceRefresh(refetch);

  // Show upcoming dates alongside upcoming/all/today filters (not overdue).
  const showDates = filter !== "overdue" && dates.length > 0;

  const report = React.useMemo<ScreenReport>(() => {
    const visible: ScreenReport["visible"] = [];
    for (const r of reminders ?? []) {
      visible.push({
        kind: "reminder",
        id: r.id,
        label: `${r.text} (${r.person.name})`,
      });
    }
    if (showDates) {
      for (const d of dates) {
        visible.push({
          kind: "importantDate",
          id: d.id,
          label: `${d.label} — ${d.person.name}`,
        });
      }
    }
    return {
      route: "/reminders",
      title: `Reminders · ${FILTERS.find((f) => f.value === filter)?.label ?? ""}`,
      visible,
    };
  }, [reminders, dates, showDates, filter]);
  useReportScreen(report);

  const empty = reminders !== null && reminders.length === 0;

  return (
    <>
      <AppHeader title="Reminders" back />

      <main className="flex flex-1 flex-col gap-4 pt-3 pb-24">
        <div className="px-4">
          <Segmented
            options={FILTERS}
            value={filter}
            onChange={(v) => setFilter(v)}
          />
        </div>

        <div className="flex-1 px-2">
          {reminders === null ? (
            <RemindersSkeleton />
          ) : error ? (
            <EmptyState
              icon={BellOff}
              title="Couldn't load reminders"
              action={
                <Button variant="outline" size="sm" onClick={() => fetchReminders(filter)}>
                  Try again
                </Button>
              }
            />
          ) : (
            <div className="flex flex-col gap-0.5">
              {reminders.map((r) => (
                <ReminderItem
                  key={r.id}
                  reminder={r}
                  person={r.person}
                  onCompleted={refetch}
                />
              ))}

              {empty ? (
                <EmptyReminders filter={filter} hasDates={showDates} />
              ) : null}

              {showDates ? (
                <div className="mt-2">
                  {!empty ? <Separator className="my-3" /> : null}
                  <div className="mb-1 flex items-center gap-1.5 px-3 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                    <CalendarClock className="size-3.5" />
                    Upcoming dates
                  </div>
                  {dates.map((d) => (
                    <UpcomingDateItem key={d.id} date={d} />
                  ))}
                </div>
              ) : null}
            </div>
          )}
        </div>
      </main>
    </>
  );
}

function EmptyReminders({
  filter,
  hasDates,
}: {
  filter: ReminderFilter;
  hasDates: boolean;
}) {
  const copy: Record<ReminderFilter, { title: string; description: string }> = {
    today: { title: "Nothing due today", description: "You're all caught up." },
    overdue: {
      title: "No overdue reminders",
      description: "Nice — nothing slipping through the cracks.",
    },
    upcoming: {
      title: "No upcoming reminders",
      description: "Set a follow-up from anyone's profile.",
    },
    all: {
      title: "No reminders yet",
      description: "Add a follow-up from a person, or just ask the voice agent.",
    },
  };
  const c = copy[filter];
  return (
    <EmptyState
      icon={filter === "overdue" || filter === "today" ? CheckCircle2 : BellOff}
      title={c.title}
      description={hasDates ? undefined : c.description}
      compact={hasDates}
      className={hasDates ? "py-4" : undefined}
    />
  );
}

function RemindersSkeleton() {
  return (
    <div className="flex flex-col gap-1" aria-hidden>
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 px-3 py-2.5">
          <Skeleton className="size-6 rounded-full" />
          <Skeleton className="size-6 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="h-3 w-2/3" />
          </div>
          <Skeleton className="h-5 w-14 rounded-full" />
        </div>
      ))}
    </div>
  );
}

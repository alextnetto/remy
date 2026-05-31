"use client";

import * as React from "react";
import Link from "next/link";
import { Bell, Plus, Search, Users, X } from "lucide-react";

import { AppHeader } from "@/components/shared/app-header";
import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PeopleListSkeleton } from "@/components/people/people-list-skeleton";
import { PersonRow } from "@/components/people/person-row";
import { TodayStrip } from "@/components/today/today-strip";
import {
  useHighlightTarget,
  useReportScreen,
  useVoiceRefresh,
  useVoiceSearch,
} from "@/components/shared/use-voice-screen";
import { api, ApiError } from "@/lib/api-contract";
import type {
  PersonSummary,
  ReminderWithPerson,
  ImportantDateWithPerson,
} from "@/lib/types";
import type { ScreenReport } from "@/lib/voice-bridge";

export default function HomePage() {
  const [query, setQuery] = React.useState("");
  const [debounced, setDebounced] = React.useState("");

  const [people, setPeople] = React.useState<PersonSummary[] | null>(null);
  const [today, setToday] = React.useState<{
    reminders: ReminderWithPerson[];
    importantDates: ImportantDateWithPerson[];
  } | null>(null);
  const [error, setError] = React.useState(false);
  const [searching, setSearching] = React.useState(false);

  useHighlightTarget();
  // Voice agent can set the search box ("who lives in San Francisco").
  useVoiceSearch(setQuery);

  // Debounce the search query.
  React.useEffect(() => {
    const t = window.setTimeout(() => setDebounced(query.trim()), 220);
    return () => window.clearTimeout(t);
  }, [query]);

  // --- People list (re-fetches on query change) ---------------------------
  // The search bar IS the LLM: a non-empty query (typed or set by the voice
  // agent) runs the natural-language /api/people/search; empty lists everyone.
  const fetchPeople = React.useCallback(
    async (q: string, signal?: AbortSignal) => {
      try {
        setError(false);
        setSearching(true);
        const list = q
          ? await api.people.search(q, signal)
          : await api.people.list(undefined, signal);
        setPeople(list);
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        if (err instanceof ApiError || err instanceof Error) setError(true);
      } finally {
        if (!signal?.aborted) setSearching(false);
      }
    },
    [],
  );

  React.useEffect(() => {
    const ctrl = new AbortController();
    void (async () => {
      await fetchPeople(debounced, ctrl.signal);
    })();
    return () => ctrl.abort();
  }, [debounced, fetchPeople]);

  // --- Today strip --------------------------------------------------------
  const fetchToday = React.useCallback(async () => {
    try {
      const t = await api.today();
      setToday(t);
    } catch {
      // The Today strip is non-critical; fail silent (hides on empty/error).
      setToday({ reminders: [], importantDates: [] });
    }
  }, []);

  React.useEffect(() => {
    void (async () => {
      await fetchToday();
    })();
  }, [fetchToday]);

  // Voice agent mutated something → re-fetch everything currently shown.
  const refetchAll = React.useCallback(() => {
    fetchPeople(debounced);
    fetchToday();
  }, [fetchPeople, fetchToday, debounced]);
  useVoiceRefresh(refetchAll);

  // --- Report screen to the voice bridge ----------------------------------
  const report = React.useMemo<ScreenReport>(() => {
    const visible: ScreenReport["visible"] = [];
    if (today) {
      for (const r of today.reminders) {
        visible.push({ kind: "reminder", id: r.id, label: `${r.text} (${r.person.name})` });
      }
      for (const d of today.importantDates) {
        visible.push({
          kind: "importantDate",
          id: d.id,
          label: `${d.label} — ${d.person.name}`,
        });
      }
    }
    for (const p of people ?? []) {
      visible.push({ kind: "person", id: p.id, label: p.name });
    }
    return { route: "/", title: "People", visible };
  }, [people, today]);
  useReportScreen(report);

  const isEmpty = people !== null && people.length === 0;

  return (
    <>
      <AppHeader
        title="Remy"
        leading={
          <div className="flex size-9 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <Users className="size-5" />
          </div>
        }
        action={
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Reminders"
              nativeButton={false}
              render={<Link href="/reminders" />}
            >
              <Bell className="size-5" />
            </Button>
            <Button size="sm" nativeButton={false} render={<Link href="/people/new" />}>
              <Plus />
              Add
            </Button>
          </div>
        }
      />

      <main className="flex flex-1 flex-col gap-4 pt-3 pb-24">
        {/* Today strip */}
        <TodayStrip
          reminders={today?.reminders ?? []}
          importantDates={today?.importantDates ?? []}
          loading={today === null}
        />

        {/* Search */}
        <div className="px-4">
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search people, interests, orgs…"
              className="h-10 pr-9 pl-8.5"
              aria-label="Search people"
              type="search"
            />
            {query ? (
              <button
                type="button"
                aria-label="Clear search"
                onClick={() => setQuery("")}
                className="absolute top-1/2 right-2 -translate-y-1/2 rounded-full p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <X className="size-4" />
              </button>
            ) : null}
          </div>
          {searching && debounced ? (
            <p className="mt-1.5 px-0.5 text-xs text-muted-foreground" aria-live="polite">
              Searching…
            </p>
          ) : null}
        </div>

        {/* People list */}
        <div className="flex-1 px-2">
          {people === null ? (
            <PeopleListSkeleton />
          ) : error ? (
            <EmptyState
              icon={Users}
              title="Couldn't load people"
              description="Something went wrong reaching the server."
              action={
                <Button variant="outline" size="sm" onClick={() => fetchPeople(debounced)}>
                  Try again
                </Button>
              }
            />
          ) : isEmpty ? (
            debounced ? (
              <EmptyState
                icon={Search}
                title={`No matches for “${debounced}”`}
                description="Try a different name, interest, or organization."
              />
            ) : (
              <EmptyState
                icon={Users}
                title="No people yet"
                description="Add the people who matter, or just say it out loud with the voice agent."
                action={
                  <Button nativeButton={false} render={<Link href="/people/new" />}>
                    <Plus />
                    Add a person
                  </Button>
                }
              />
            )
          ) : (
            <div className="flex flex-col gap-0.5">
              {people.map((p) => (
                <PersonRow key={p.id} person={p} />
              ))}
            </div>
          )}
        </div>
      </main>
    </>
  );
}

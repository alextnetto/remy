"use client";

import * as React from "react";
import { use } from "react";
import { useRouter } from "next/navigation";
import { UserX } from "lucide-react";

import { AppHeader } from "@/components/shared/app-header";
import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";
import { PersonHeader } from "@/components/person/person-header";
import { PersonDetailSkeleton } from "@/components/person/person-detail-skeleton";
import { StorySection } from "@/components/person/story-section";
import { ContactsSection } from "@/components/person/contacts-section";
import { DatesSection } from "@/components/person/dates-section";
import { OrgsSection } from "@/components/person/orgs-section";
import { NotesSection } from "@/components/person/notes-section";
import { MomentsSection } from "@/components/person/moments-section";
import { RemindersSection } from "@/components/person/reminders-section";
import {
  useHighlightTarget,
  useReportScreen,
  useVoiceRefresh,
} from "@/components/shared/use-voice-screen";
import { api, ApiError } from "@/lib/api-contract";
import type { PersonDetail } from "@/lib/types";
import type { ScreenReport } from "@/lib/voice-bridge";

export default function PersonDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();

  const [person, setPerson] = React.useState<PersonDetail | null>(null);
  const [status, setStatus] = React.useState<"loading" | "ready" | "notfound" | "error">(
    "loading",
  );

  useHighlightTarget();

  const fetchPerson = React.useCallback(
    async (signal?: AbortSignal) => {
      try {
        const data = await api.people.get(id, signal);
        setPerson(data);
        setStatus("ready");
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        if (err instanceof ApiError && err.status === 404) {
          setStatus("notfound");
        } else {
          setStatus((s) => (s === "ready" ? "ready" : "error"));
        }
      }
    },
    [id],
  );

  React.useEffect(() => {
    const ctrl = new AbortController();
    void (async () => {
      setStatus("loading");
      setPerson(null);
      await fetchPerson(ctrl.signal);
    })();
    return () => ctrl.abort();
  }, [fetchPerson]);

  // Voice mutations → silent refetch (don't flash the skeleton).
  const refetch = React.useCallback(() => {
    fetchPerson();
  }, [fetchPerson]);
  useVoiceRefresh(refetch);

  // Report the full screen: section anchors + addressable items for deixis.
  const report = React.useMemo<ScreenReport>(() => {
    if (!person) {
      return { route: `/people/${id}`, title: "Person", visible: [] };
    }
    const visible: ScreenReport["visible"] = [
      { kind: "section", label: "Story" },
      { kind: "section", label: "Contacts" },
      { kind: "section", label: "Important dates" },
      { kind: "section", label: "Organizations" },
      { kind: "section", label: "Notes" },
      { kind: "section", label: "Moments" },
      { kind: "section", label: "Reminders" },
    ];
    for (const c of person.contacts) {
      visible.push({ kind: "contact", id: c.id, label: `${c.kind}: ${c.value}` });
    }
    for (const d of person.importantDates) {
      visible.push({ kind: "importantDate", id: d.id, label: d.label });
    }
    for (const o of person.organizations) {
      visible.push({ kind: "organization", id: o.id, label: o.org.name });
    }
    for (const n of person.notes) {
      visible.push({
        kind: "note",
        id: n.id,
        label: n.body.slice(0, 60),
      });
    }
    for (const r of person.reminders.filter((r) => !r.done)) {
      visible.push({ kind: "reminder", id: r.id, label: r.text });
    }
    for (const m of person.moments) {
      visible.push({
        kind: "moment",
        id: m.id,
        label: m.title ?? m.description.slice(0, 60),
      });
    }
    return { route: `/people/${id}`, title: person.name, visible };
  }, [person, id]);
  useReportScreen(report);

  if (status === "loading") {
    return (
      <>
        <AppHeader title="" back />
        <main className="flex-1 pb-24">
          <PersonDetailSkeleton />
        </main>
      </>
    );
  }

  if (status === "notfound" || status === "error") {
    return (
      <>
        <AppHeader title="Not found" back />
        <main className="flex flex-1 items-center justify-center pb-24">
          <EmptyState
            icon={UserX}
            title={status === "notfound" ? "Person not found" : "Couldn't load profile"}
            description={
              status === "notfound"
                ? "They may have been removed."
                : "Something went wrong reaching the server."
            }
            action={
              status === "notfound" ? (
                <Button variant="outline" size="sm" onClick={() => router.push("/")}>
                  Back to people
                </Button>
              ) : (
                <Button variant="outline" size="sm" onClick={() => fetchPerson()}>
                  Try again
                </Button>
              )
            }
          />
        </main>
      </>
    );
  }

  // status === "ready"
  const p = person!;

  return (
    <>
      <AppHeader title={p.name} subtitle={p.relationshipToMe ?? undefined} back />

      <main className="flex flex-1 flex-col gap-3 pb-24">
        <PersonHeader person={p} />

        <div className="flex flex-col gap-3 px-3">
          <StorySection personId={p.id} story={p.story} onSaved={refetch} />
          <ContactsSection
            personId={p.id}
            contacts={p.contacts}
            onChanged={refetch}
          />
          <DatesSection
            personId={p.id}
            dates={p.importantDates}
            onChanged={refetch}
          />
          <OrgsSection
            personId={p.id}
            organizations={p.organizations}
            onChanged={refetch}
          />
          <NotesSection personId={p.id} notes={p.notes} onChanged={refetch} />
          <MomentsSection personId={p.id} moments={p.moments} />
          <RemindersSection
            personId={p.id}
            reminders={p.reminders}
            onChanged={refetch}
          />
        </div>
      </main>
    </>
  );
}

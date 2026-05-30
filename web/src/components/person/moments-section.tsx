"use client";

import { useRouter } from "next/navigation";
import { Building2, MapPin, Sparkles } from "lucide-react";

import { PersonAvatar } from "@/components/shared/person-avatar";
import { EmptyState } from "@/components/shared/empty-state";
import { shortDate } from "@/components/shared/format";
import { Section } from "./section";
import type { MomentWithPeople } from "@/lib/types";

/**
 * Read-only timeline of moments this person is in. Each moment shows place,
 * date, an optional org, and co-participant chips (excluding the current
 * person). Newest first.
 */
export function MomentsSection({
  personId,
  moments,
}: {
  personId: string;
  moments: MomentWithPeople[];
}) {
  const sorted = [...moments].sort((a, b) => {
    const av = a.occurredAt ?? a.createdAt;
    const bv = b.occurredAt ?? b.createdAt;
    return bv.localeCompare(av);
  });

  return (
    <Section icon={Sparkles} title="Moments" count={moments.length}>
      {sorted.length === 0 ? (
        <EmptyState
          compact
          icon={Sparkles}
          title="No moments yet"
          description="Shared experiences will show up here."
        />
      ) : (
        <ol className="relative ml-1 flex flex-col gap-3 border-l border-border pl-4">
          {sorted.map((m) => (
            <MomentRow key={m.id} moment={m} personId={personId} />
          ))}
        </ol>
      )}
    </Section>
  );
}

function MomentRow({
  moment,
  personId,
}: {
  moment: MomentWithPeople;
  personId: string;
}) {
  const router = useRouter();
  const others = moment.people.filter((p) => p.id !== personId);

  return (
    <li data-highlight-id={moment.id} className="relative">
      <span className="absolute top-1 -left-[1.30rem] size-2 rounded-full bg-primary ring-4 ring-card" />
      <div className="flex flex-col gap-1.5">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
          {moment.occurredAt ? (
            <span className="font-medium text-foreground/70">
              {shortDate(moment.occurredAt)}
            </span>
          ) : null}
          {moment.place ? (
            <span className="flex items-center gap-0.5">
              <MapPin className="size-3" />
              {moment.place}
            </span>
          ) : null}
          {moment.organization ? (
            <span className="flex items-center gap-0.5">
              <Building2 className="size-3" />
              {moment.organization.name}
            </span>
          ) : null}
        </div>

        {moment.title ? (
          <p className="text-sm font-medium">{moment.title}</p>
        ) : null}
        <p className="text-sm leading-relaxed text-foreground/90">
          {moment.description}
        </p>

        {others.length > 0 ? (
          <div className="mt-0.5 flex flex-wrap gap-1.5">
            {others.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => router.push(`/people/${p.id}`)}
                className="flex items-center gap-1 rounded-full bg-muted py-0.5 pr-2 pl-0.5 text-xs font-medium transition-colors hover:bg-muted-foreground/15"
              >
                <PersonAvatar
                  id={p.id}
                  name={p.name}
                  avatarUrl={p.avatarUrl}
                  size="sm"
                  className="size-5"
                />
                {p.name}
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </li>
  );
}

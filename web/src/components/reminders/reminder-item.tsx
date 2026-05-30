"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, Clock, Loader2 } from "lucide-react";

import { PersonAvatar } from "@/components/shared/person-avatar";
import { dateTime, dueLabel, isOverdue } from "@/components/shared/format";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api-contract";
import type { PersonSummary, Reminder } from "@/lib/types";

interface ReminderItemProps {
  reminder: Reminder;
  /** When present, shows the person (cross-person list on /reminders). */
  person?: PersonSummary | null;
  /** Called after a successful complete so the parent can refetch. */
  onCompleted?: () => void;
  /** Allow re-completing display for already-done items (detail "done" list). */
  interactive?: boolean;
}

/**
 * A single reminder line. On the cross-person Reminders screen it shows the
 * person avatar and is tappable to open them. A round checkbox completes it.
 */
export function ReminderItem({
  reminder,
  person,
  onCompleted,
  interactive = true,
}: ReminderItemProps) {
  const router = useRouter();
  const [completing, setCompleting] = React.useState(false);
  const done = reminder.done;
  const overdue = !done && isOverdue(reminder.dueAt);

  async function complete(e: React.MouseEvent) {
    e.stopPropagation();
    if (completing || done) return;
    setCompleting(true);
    try {
      await api.reminders.complete(reminder.id);
      toast.success("Reminder completed");
      onCompleted?.();
    } catch {
      toast.error("Couldn't complete reminder");
      setCompleting(false);
    }
  }

  const Wrapper = person ? "button" : "div";

  return (
    <Wrapper
      data-highlight-id={reminder.id}
      {...(person
        ? {
            type: "button" as const,
            onClick: () => router.push(`/people/${person.id}`),
          }
        : {})}
      className={cn(
        "group flex w-full items-center gap-3 rounded-2xl border border-transparent px-3 py-2.5 text-left transition-colors",
        person && "hover:bg-muted/70 active:bg-muted",
        "focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/40 focus-visible:outline-none",
      )}
    >
      {/* Complete toggle */}
      {interactive ? (
        <span
          role="checkbox"
          aria-checked={done}
          aria-label={done ? "Completed" : "Mark complete"}
          tabIndex={0}
          onClick={complete}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              complete(e as unknown as React.MouseEvent);
            }
          }}
          className={cn(
            "flex size-6 shrink-0 items-center justify-center rounded-full border-2 transition-colors",
            done
              ? "border-emerald-500 bg-emerald-500 text-white"
              : "border-muted-foreground/40 text-transparent hover:border-emerald-500 hover:text-emerald-500/40",
          )}
        >
          {completing ? (
            <Loader2 className="size-3.5 animate-spin text-muted-foreground" />
          ) : (
            <Check className="size-3.5" />
          )}
        </span>
      ) : null}

      {person ? (
        <PersonAvatar
          id={person.id}
          name={person.name}
          avatarUrl={person.avatarUrl}
          size="sm"
        />
      ) : null}

      <div className="min-w-0 flex-1">
        <p
          className={cn(
            "truncate text-sm font-medium",
            done && "text-muted-foreground line-through",
          )}
        >
          {reminder.text}
        </p>
        <div className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
          {person ? (
            <>
              <span className="truncate">{person.name}</span>
              <span className="text-border">·</span>
            </>
          ) : null}
          <Clock className="size-3 shrink-0" />
          <span className="truncate">{dateTime(reminder.dueAt)}</span>
        </div>
      </div>

      {!done ? (
        <Badge
          variant={overdue ? "destructive" : "secondary"}
          className="shrink-0"
        >
          {dueLabel(reminder.dueAt)}
        </Badge>
      ) : null}
    </Wrapper>
  );
}

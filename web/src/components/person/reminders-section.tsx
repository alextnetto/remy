"use client";

import * as React from "react";
import { toast } from "sonner";
import { BellRing, CheckCircle2, Loader2, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { EmptyState } from "@/components/shared/empty-state";
import { ReminderItem } from "@/components/reminders/reminder-item";
import { Section } from "./section";
import { api } from "@/lib/api-contract";
import type { Reminder } from "@/lib/types";

/** Default the picker to tomorrow at 9am, formatted for datetime-local. */
function defaultDue(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(9, 0, 0, 0);
  // Local time, trimmed to minutes (datetime-local has no timezone).
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function RemindersSection({
  personId,
  reminders,
  onChanged,
}: {
  personId: string;
  reminders: Reminder[];
  onChanged: () => void;
}) {
  const [open, setOpen] = React.useState(false);

  const openReminders = reminders
    .filter((r) => !r.done)
    .sort((a, b) => a.dueAt.localeCompare(b.dueAt));
  const doneReminders = reminders
    .filter((r) => r.done)
    .sort((a, b) => b.dueAt.localeCompare(a.dueAt));

  return (
    <Section
      icon={BellRing}
      title="Reminders"
      count={openReminders.length}
      action={
        <Button
          variant="ghost"
          size="xs"
          onClick={() => setOpen(true)}
          aria-label="Add reminder"
        >
          <Plus />
          Add
        </Button>
      }
    >
      {reminders.length === 0 ? (
        <EmptyState
          compact
          icon={BellRing}
          title="No reminders"
          description="Set a follow-up so you don't lose touch."
        />
      ) : (
        <div className="flex flex-col gap-2">
          {openReminders.length > 0 ? (
            <ul className="flex flex-col gap-0.5">
              {openReminders.map((r) => (
                <ReminderItem key={r.id} reminder={r} onCompleted={onChanged} />
              ))}
            </ul>
          ) : (
            <div className="flex items-center gap-2 rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300">
              <CheckCircle2 className="size-4" />
              All caught up
            </div>
          )}

          {doneReminders.length > 0 ? (
            <details className="group/done">
              <summary className="cursor-pointer list-none px-2 py-1 text-xs font-medium text-muted-foreground hover:text-foreground">
                {doneReminders.length} completed
              </summary>
              <ul className="mt-0.5 flex flex-col gap-0.5 opacity-75">
                {doneReminders.map((r) => (
                  <ReminderItem key={r.id} reminder={r} interactive={false} />
                ))}
              </ul>
            </details>
          ) : null}
        </div>
      )}

      <AddReminderDialog
        personId={personId}
        open={open}
        onOpenChange={setOpen}
        onAdded={onChanged}
      />
    </Section>
  );
}

function AddReminderDialog({
  personId,
  open,
  onOpenChange,
  onAdded,
}: {
  personId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAdded: () => void;
}) {
  const [text, setText] = React.useState("");
  const [due, setDue] = React.useState(defaultDue());
  const [saving, setSaving] = React.useState(false);

  function reset() {
    setText("");
    setDue(defaultDue());
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const t = text.trim();
    if (!t) {
      toast.error("What's the reminder?");
      return;
    }
    if (!due) {
      toast.error("Pick a date & time");
      return;
    }
    setSaving(true);
    try {
      // datetime-local is local wall time; convert to a real ISO instant.
      const iso = new Date(due).toISOString();
      await api.reminders.create(personId, { text: t, dueAt: iso });
      toast.success("Reminder set");
      onOpenChange(false);
      reset();
      onAdded();
    } catch {
      toast.error("Couldn't set reminder");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) reset();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add reminder</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="flex flex-col gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor="r-text">Reminder</Label>
            <Input
              id="r-text"
              autoFocus
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Check in after their move"
              maxLength={200}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="r-due">When</Label>
            <Input
              id="r-due"
              type="datetime-local"
              value={due}
              onChange={(e) => setDue(e.target.value)}
            />
          </div>
          <div className="mt-1 flex justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={saving || !text.trim() || !due}>
              {saving ? <Loader2 className="animate-spin" /> : <Plus />}
              Set reminder
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

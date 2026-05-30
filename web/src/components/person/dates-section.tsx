"use client";

import * as React from "react";
import { toast } from "sonner";
import {
  CalendarDays,
  CalendarHeart,
  Gift,
  Loader2,
  Plus,
  Repeat,
  Trash2,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/shared/empty-state";
import { importantDateLabel } from "@/components/shared/format";
import { Section } from "./section";
import { api } from "@/lib/api-contract";
import type { ImportantDate } from "@/lib/types";

export function DatesSection({
  personId,
  dates,
  onChanged,
}: {
  personId: string;
  dates: ImportantDate[];
  onChanged: () => void;
}) {
  const [open, setOpen] = React.useState(false);

  return (
    <Section
      icon={CalendarDays}
      title="Important dates"
      count={dates.length}
      action={
        <Button
          variant="ghost"
          size="xs"
          onClick={() => setOpen(true)}
          aria-label="Add date"
        >
          <Plus />
          Add
        </Button>
      }
    >
      {dates.length === 0 ? (
        <EmptyState
          compact
          icon={CalendarHeart}
          title="No dates yet"
          description="Add a birthday or anniversary."
        />
      ) : (
        <ul className="flex flex-col gap-0.5">
          {dates.map((d) => (
            <DateRow key={d.id} date={d} onChanged={onChanged} />
          ))}
        </ul>
      )}

      <AddDateDialog
        personId={personId}
        open={open}
        onOpenChange={setOpen}
        onAdded={onChanged}
      />
    </Section>
  );
}

function DateRow({
  date,
  onChanged,
}: {
  date: ImportantDate;
  onChanged: () => void;
}) {
  const [removing, setRemoving] = React.useState(false);
  const isBirthday = /birthday/i.test(date.label);

  async function remove() {
    setRemoving(true);
    try {
      await api.dates.remove(date.id);
      toast.success("Date removed");
      onChanged();
    } catch {
      toast.error("Couldn't remove date");
      setRemoving(false);
    }
  }

  return (
    <li className="group flex items-center gap-3 rounded-xl px-2 py-1.5 transition-colors hover:bg-muted/70">
      <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-600 dark:bg-amber-500/15 dark:text-amber-400">
        {isBirthday ? <Gift className="size-4" /> : <CalendarHeart className="size-4" />}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{date.label}</p>
        <p className="flex items-center gap-1 text-xs text-muted-foreground">
          {importantDateLabel(date.date, date.recurring)}
          {date.recurring ? (
            <Badge variant="secondary" className="h-4 gap-0.5 px-1 text-[10px]">
              <Repeat className="size-2.5" /> yearly
            </Badge>
          ) : null}
        </p>
      </div>
      <Button
        variant="ghost"
        size="icon-xs"
        aria-label="Remove date"
        onClick={remove}
        disabled={removing}
        className="shrink-0 text-muted-foreground/60 opacity-0 transition-opacity group-hover:opacity-100 hover:text-destructive focus-visible:opacity-100"
      >
        {removing ? <Loader2 className="animate-spin" /> : <Trash2 />}
      </Button>
    </li>
  );
}

function AddDateDialog({
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
  const [label, setLabel] = React.useState("Birthday");
  const [date, setDate] = React.useState("");
  const [recurring, setRecurring] = React.useState(true);
  const [saving, setSaving] = React.useState(false);

  function reset() {
    setLabel("Birthday");
    setDate("");
    setRecurring(true);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!label.trim()) {
      toast.error("Enter a label");
      return;
    }
    if (!date) {
      toast.error("Pick a date");
      return;
    }
    setSaving(true);
    try {
      await api.dates.create(personId, {
        label: label.trim(),
        date,
        recurring,
      });
      toast.success("Date added");
      onOpenChange(false);
      reset();
      onAdded();
    } catch {
      toast.error("Couldn't add date");
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
          <DialogTitle>Add important date</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="flex flex-col gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor="d-label">Label</Label>
            <Input
              id="d-label"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Birthday, Work anniversary…"
              maxLength={60}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="d-date">Date</Label>
            <Input
              id="d-date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>
          <label className="flex items-center gap-2 text-sm select-none">
            <input
              type="checkbox"
              checked={recurring}
              onChange={(e) => setRecurring(e.target.checked)}
              className="size-4 rounded border-input accent-primary"
            />
            Repeats every year
          </label>
          <div className="mt-1 flex justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={saving || !date || !label.trim()}>
              {saving ? <Loader2 className="animate-spin" /> : <Plus />}
              Add
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

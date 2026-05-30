"use client";

import * as React from "react";
import { toast } from "sonner";
import { Loader2, Pin, Plus, StickyNote, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { EmptyState } from "@/components/shared/empty-state";
import { timeAgo } from "@/components/shared/format";
import { cn } from "@/lib/utils";
import { Section } from "./section";
import { api } from "@/lib/api-contract";
import type { Note } from "@/lib/types";

/** Pinned notes first, then newest-first. */
function sortNotes(notes: Note[]): Note[] {
  return [...notes].sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    return b.createdAt.localeCompare(a.createdAt);
  });
}

export function NotesSection({
  personId,
  notes,
  onChanged,
}: {
  personId: string;
  notes: Note[];
  onChanged: () => void;
}) {
  const [adding, setAdding] = React.useState(false);
  const [body, setBody] = React.useState("");
  const [pinned, setPinned] = React.useState(false);
  const [saving, setSaving] = React.useState(false);

  const sorted = React.useMemo(() => sortNotes(notes), [notes]);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    const text = body.trim();
    if (!text) return;
    setSaving(true);
    try {
      await api.notes.create(personId, { body: text, pinned });
      toast.success("Note added");
      setBody("");
      setPinned(false);
      setAdding(false);
      onChanged();
    } catch {
      toast.error("Couldn't add note");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Section
      icon={StickyNote}
      title="Notes"
      count={notes.length}
      action={
        !adding ? (
          <Button
            variant="ghost"
            size="xs"
            onClick={() => setAdding(true)}
            aria-label="Add note"
          >
            <Plus />
            Add
          </Button>
        ) : null
      }
    >
      {adding ? (
        <form onSubmit={add} className="mb-2 flex flex-col gap-2">
          <Textarea
            autoFocus
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="What happened? What did you learn?"
            rows={3}
            maxLength={1000}
          />
          <div className="flex items-center justify-between">
            <label className="flex items-center gap-1.5 text-sm text-muted-foreground select-none">
              <input
                type="checkbox"
                checked={pinned}
                onChange={(e) => setPinned(e.target.checked)}
                className="size-3.5 rounded border-input accent-primary"
              />
              <Pin className="size-3.5" /> Pin
            </label>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  setAdding(false);
                  setBody("");
                  setPinned(false);
                }}
                disabled={saving}
              >
                Cancel
              </Button>
              <Button type="submit" size="sm" disabled={saving || !body.trim()}>
                {saving ? <Loader2 className="animate-spin" /> : null}
                Save note
              </Button>
            </div>
          </div>
        </form>
      ) : null}

      {sorted.length === 0 && !adding ? (
        <EmptyState
          compact
          icon={StickyNote}
          title="No notes yet"
          description="Jot down something you want to remember."
        />
      ) : (
        <ul className="flex flex-col gap-2">
          {sorted.map((n) => (
            <NoteCard key={n.id} note={n} onChanged={onChanged} />
          ))}
        </ul>
      )}
    </Section>
  );
}

function NoteCard({ note, onChanged }: { note: Note; onChanged: () => void }) {
  const [removing, setRemoving] = React.useState(false);

  async function remove() {
    setRemoving(true);
    try {
      await api.notes.remove(note.id);
      toast.success("Note removed");
      onChanged();
    } catch {
      toast.error("Couldn't remove note");
      setRemoving(false);
    }
  }

  return (
    <li
      data-highlight-id={note.id}
      className={cn(
        "group relative rounded-xl border border-border/70 bg-background p-2.5",
        note.pinned && "border-amber-300/70 bg-amber-50/60 dark:border-amber-500/30 dark:bg-amber-500/5",
      )}
    >
      <p className="text-sm leading-relaxed whitespace-pre-wrap">{note.body}</p>
      <div className="mt-1.5 flex items-center gap-1.5 text-xs text-muted-foreground">
        {note.pinned ? (
          <span className="flex items-center gap-0.5 text-amber-600 dark:text-amber-400">
            <Pin className="size-3" /> Pinned
          </span>
        ) : null}
        {note.pinned ? <span className="text-border">·</span> : null}
        <span>{timeAgo(note.createdAt)}</span>
      </div>
      <Button
        variant="ghost"
        size="icon-xs"
        aria-label="Remove note"
        onClick={remove}
        disabled={removing}
        className="absolute top-1.5 right-1.5 text-muted-foreground/60 opacity-0 transition-opacity group-hover:opacity-100 hover:text-destructive focus-visible:opacity-100"
      >
        {removing ? <Loader2 className="animate-spin" /> : <Trash2 />}
      </Button>
    </li>
  );
}

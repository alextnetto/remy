"use client";

import * as React from "react";
import { toast } from "sonner";
import { BookOpen, Check, Loader2, Pencil, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Section } from "./section";
import { api } from "@/lib/api-contract";

/**
 * Inline-editable narrative ("story") for a person. Click "Edit" to switch the
 * card into a textarea; save patches the person and refetches.
 */
export function StorySection({
  personId,
  story,
  onSaved,
}: {
  personId: string;
  story: string | null;
  onSaved: () => void;
}) {
  const [editing, setEditing] = React.useState(false);
  const [value, setValue] = React.useState(story ?? "");
  const [saving, setSaving] = React.useState(false);

  // Keep the local buffer in sync with the server value when it changes and
  // we're not mid-edit — done during render (React's "adjust state on prop
  // change" pattern) rather than in an effect, so there's no extra commit.
  const [syncedStory, setSyncedStory] = React.useState(story);
  if (!editing && story !== syncedStory) {
    setSyncedStory(story);
    setValue(story ?? "");
  }

  async function save() {
    setSaving(true);
    try {
      await api.people.update(personId, { story: value.trim() || null });
      toast.success("Story saved");
      setEditing(false);
      onSaved();
    } catch {
      toast.error("Couldn't save story");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Section
      icon={BookOpen}
      title="Story"
      action={
        editing ? (
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label="Cancel"
              onClick={() => {
                setEditing(false);
                setValue(story ?? "");
              }}
              disabled={saving}
            >
              <X />
            </Button>
            <Button
              variant="default"
              size="icon-xs"
              aria-label="Save story"
              onClick={save}
              disabled={saving}
            >
              {saving ? <Loader2 className="animate-spin" /> : <Check />}
            </Button>
          </div>
        ) : (
          <Button
            variant="ghost"
            size="xs"
            onClick={() => setEditing(true)}
            aria-label="Edit story"
          >
            <Pencil />
            {story ? "Edit" : "Add"}
          </Button>
        )
      }
    >
      {editing ? (
        <Textarea
          autoFocus
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="How you met, what they're into, what matters to them…"
          rows={5}
          maxLength={2000}
        />
      ) : story ? (
        <p
          data-highlight-id="field:story"
          className="text-sm leading-relaxed whitespace-pre-wrap text-foreground/90"
        >
          {story}
        </p>
      ) : (
        <p data-highlight-id="field:story" className="text-sm text-muted-foreground">
          No story yet. Capture how you know them.
        </p>
      )}
    </Section>
  );
}

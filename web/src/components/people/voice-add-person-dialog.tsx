"use client";

/**
 * Voice-controlled Add Person dialog.
 *
 * Mounted ONCE in the app shell (see `app/layout.tsx`) so the voice agent can
 * open, fill, and submit it from any screen — the voice twin of the manual
 * {@link AddPersonDialog} button flow. The agent drives it via the `addPerson`
 * UICommand → {@link voiceBridge.onAddPerson}:
 *
 *   - `fields` opens the dialog and merges those values into the form;
 *   - `submit` saves the current draft (POST /api/people) — the user confirmed;
 *   - `cancel` closes it without saving.
 *
 * While open, the live draft is published back to the worker
 * (`voiceBridge.reportDialog`) so it rides along in the `screen` UIEvent. That
 * open form is the worker's cross-turn memory: each turn it sees what's filled
 * and what's missing, so "he's in SF" / "add him" resolve against this draft.
 *
 * The user can also edit any field by hand and click Add / Cancel.
 */

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Plus } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { api, ApiError } from "@/lib/api-contract";
import { voiceBridge } from "@/lib/voice-bridge";

export function VoiceAddPersonDialog() {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);
  const [name, setName] = React.useState("");
  const [relationship, setRelationship] = React.useState("");
  const [base, setBase] = React.useState("");
  const [story, setStory] = React.useState("");

  const reset = React.useCallback(() => {
    setName("");
    setRelationship("");
    setBase("");
    setStory("");
  }, []);

  const submit = React.useCallback(async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      toast.error("Please say a name first");
      return;
    }
    setSubmitting(true);
    try {
      const person = await api.people.create({
        name: trimmed,
        relationshipToMe: relationship.trim() || undefined,
        base: base.trim() || undefined,
        story: story.trim() || undefined,
      });
      toast.success(`Added ${person.name}`);
      setOpen(false);
      reset();
      router.push(`/people/${person.id}`);
    } catch (err) {
      toast.error(
        err instanceof ApiError ? `Couldn't add person (${err.status})` : "Couldn't add person",
      );
    } finally {
      setSubmitting(false);
    }
  }, [name, relationship, base, story, reset, router]);

  // The bridge subscription registers once; route submits through a ref so it
  // always runs the latest closure (current field values).
  const submitRef = React.useRef(submit);
  submitRef.current = submit;

  // Voice control: open / fill / submit / cancel.
  React.useEffect(() => {
    return voiceBridge.onAddPerson((cmd) => {
      if (cmd.cancel) {
        setOpen(false);
        reset();
        return;
      }
      if (cmd.fields) {
        const f = cmd.fields;
        setOpen(true);
        if (typeof f.name === "string") setName(f.name);
        if (typeof f.relationship === "string") setRelationship(f.relationship);
        if (typeof f.base === "string") setBase(f.base);
        if (typeof f.story === "string") setStory(f.story);
      }
      if (cmd.submit) {
        void submitRef.current();
      }
    });
  }, [reset]);

  // Publish the live draft to the worker while open (its cross-turn memory).
  React.useEffect(() => {
    voiceBridge.reportDialog(
      open ? { kind: "addPerson", fields: { name, relationship, base, story } } : null,
    );
  }, [open, name, relationship, base, story]);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reset();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add a person</DialogTitle>
          <DialogDescription>
            The assistant is filling this in — correct anything, then say “add them”.
          </DialogDescription>
        </DialogHeader>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
          className="flex flex-col gap-3"
        >
          <div className="grid gap-1.5">
            <Label htmlFor="vap-name">Name</Label>
            <Input
              id="vap-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Sarah Chen"
              maxLength={120}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="vap-rel">Relationship</Label>
              <Input
                id="vap-rel"
                value={relationship}
                onChange={(e) => setRelationship(e.target.value)}
                placeholder="friend"
                maxLength={60}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="vap-base">Base</Label>
              <Input
                id="vap-base"
                value={base}
                onChange={(e) => setBase(e.target.value)}
                placeholder="San Francisco"
                maxLength={80}
              />
            </div>
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="vap-story">Story (optional)</Label>
            <Textarea
              id="vap-story"
              value={story}
              onChange={(e) => setStory(e.target.value)}
              placeholder="How you met, what they're up to…"
              maxLength={1000}
              rows={3}
            />
          </div>

          <div className="mt-1 flex justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setOpen(false);
                reset();
              }}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={submitting || !name.trim()}>
              {submitting ? <Loader2 className="animate-spin" /> : <Plus />}
              Add person
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

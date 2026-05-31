"use client";

/**
 * Add Person — a dedicated page (not a modal).
 *
 * Works standalone (type + Add) and is the surface the voice agent drives: the
 * `addPerson` UICommand navigates here and fills fields via
 * {@link voiceBridge.onAddPerson}; `submit` saves; `cancel` leaves. Fields
 * stashed before navigation are applied on mount (`consumePendingAddPerson`).
 *
 * While mounted, the live draft is published to the worker
 * (`voiceBridge.reportDialog`) so it rides along in the `screen` event — the
 * worker's cross-turn memory of what's filled / still missing.
 */

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, UserPlus } from "lucide-react";

import { AppHeader } from "@/components/shared/app-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useReportScreen } from "@/components/shared/use-voice-screen";
import { api, ApiError } from "@/lib/api-contract";
import { voiceBridge, type ScreenReport } from "@/lib/voice-bridge";

export default function NewPersonPage() {
  const router = useRouter();
  const [submitting, setSubmitting] = React.useState(false);
  const [name, setName] = React.useState("");
  const [relationship, setRelationship] = React.useState("");
  const [base, setBase] = React.useState("");
  const [story, setStory] = React.useState("");

  const submit = React.useCallback(async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      toast.error("Please enter a name");
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
      voiceBridge.reportDialog(null);
      router.push(`/people/${person.id}`);
    } catch (err) {
      toast.error(
        err instanceof ApiError ? `Couldn't add person (${err.status})` : "Couldn't add person",
      );
      setSubmitting(false);
    }
  }, [name, relationship, base, story, router]);

  // The bridge subscription registers once; route submits through a ref so it
  // always runs the latest closure (current field values).
  const submitRef = React.useRef(submit);
  submitRef.current = submit;

  // Apply any fields stashed before navigation, then subscribe to voice control.
  React.useEffect(() => {
    const pending = voiceBridge.consumePendingAddPerson();
    if (pending) {
      if (typeof pending.name === "string") setName(pending.name);
      if (typeof pending.relationship === "string") setRelationship(pending.relationship);
      if (typeof pending.base === "string") setBase(pending.base);
      if (typeof pending.story === "string") setStory(pending.story);
    }
    return voiceBridge.onAddPerson((cmd) => {
      if (cmd.cancel) {
        voiceBridge.reportDialog(null);
        router.push("/");
        return;
      }
      if (cmd.fields) {
        const f = cmd.fields;
        if (typeof f.name === "string") setName(f.name);
        if (typeof f.relationship === "string") setRelationship(f.relationship);
        if (typeof f.base === "string") setBase(f.base);
        if (typeof f.story === "string") setStory(f.story);
      }
      if (cmd.submit) {
        void submitRef.current();
      }
    });
  }, [router]);

  // Publish the live draft to the worker while on this page (its cross-turn memory).
  React.useEffect(() => {
    voiceBridge.reportDialog({ kind: "addPerson", fields: { name, relationship, base, story } });
  }, [name, relationship, base, story]);
  // Clear it once, on unmount.
  React.useEffect(() => {
    return () => voiceBridge.reportDialog(null);
  }, []);

  // Report the screen for voice grounding.
  const report = React.useMemo<ScreenReport>(
    () => ({ route: "/people/new", title: "Add a person", visible: [] }),
    [],
  );
  useReportScreen(report);

  return (
    <>
      <AppHeader title="Add a person" back />
      <main className="flex flex-1 flex-col gap-4 px-4 pt-3 pb-28">
        <p className="text-sm text-muted-foreground">
          Tell the assistant about them, or fill this in yourself — then say “add them” or tap Add.
        </p>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
          className="flex flex-col gap-4"
        >
          <div className="grid gap-1.5">
            <Label htmlFor="np-name">Name</Label>
            <Input
              id="np-name"
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Sarah Chen"
              maxLength={120}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="np-rel">Relationship</Label>
              <Input
                id="np-rel"
                value={relationship}
                onChange={(e) => setRelationship(e.target.value)}
                placeholder="friend"
                maxLength={60}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="np-base">Base</Label>
              <Input
                id="np-base"
                value={base}
                onChange={(e) => setBase(e.target.value)}
                placeholder="San Francisco"
                maxLength={80}
              />
            </div>
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="np-story">Story (optional)</Label>
            <Textarea
              id="np-story"
              value={story}
              onChange={(e) => setStory(e.target.value)}
              placeholder="How you met, what they're up to…"
              maxLength={1000}
              rows={4}
            />
          </div>

          <div className="mt-1 flex justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => router.push("/")}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={submitting || !name.trim()}>
              {submitting ? <Loader2 className="animate-spin" /> : <UserPlus />}
              Add person
            </Button>
          </div>
        </form>
      </main>
    </>
  );
}

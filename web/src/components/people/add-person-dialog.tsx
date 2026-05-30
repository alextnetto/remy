"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { api, ApiError } from "@/lib/api-contract";

/**
 * "Add person" flow. Controlled dialog with a small form; on success navigates
 * straight to the new person's detail screen.
 */
export function AddPersonDialog({ trigger }: { trigger?: React.ReactNode }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);
  const [name, setName] = React.useState("");
  const [relationship, setRelationship] = React.useState("");
  const [base, setBase] = React.useState("");
  const [story, setStory] = React.useState("");

  function reset() {
    setName("");
    setRelationship("");
    setBase("");
    setStory("");
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
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
      setOpen(false);
      reset();
      router.push(`/people/${person.id}`);
    } catch (err) {
      const msg =
        err instanceof ApiError ? `Couldn't add person (${err.status})` : "Couldn't add person";
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reset();
      }}
    >
      {trigger ? (
        <span onClick={() => setOpen(true)}>{trigger}</span>
      ) : (
        <Button size="sm" onClick={() => setOpen(true)}>
          <Plus />
          Add
        </Button>
      )}

      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add a person</DialogTitle>
          <DialogDescription>
            Start a new profile. You can add contacts, dates and notes after.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} className="flex flex-col gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor="ap-name">Name</Label>
            <Input
              id="ap-name"
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Sarah Chen"
              maxLength={120}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="ap-rel">Relationship</Label>
              <Input
                id="ap-rel"
                value={relationship}
                onChange={(e) => setRelationship(e.target.value)}
                placeholder="friend"
                maxLength={60}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="ap-base">Base</Label>
              <Input
                id="ap-base"
                value={base}
                onChange={(e) => setBase(e.target.value)}
                placeholder="San Francisco"
                maxLength={80}
              />
            </div>
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="ap-story">Story (optional)</Label>
            <Textarea
              id="ap-story"
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
              onClick={() => setOpen(false)}
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

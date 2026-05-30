"use client";

import * as React from "react";
import { toast } from "sonner";
import { ExternalLink, Loader2, Plus, Trash2, UserRound } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ContactIcon } from "@/components/shared/contact-icon";
import { EmptyState } from "@/components/shared/empty-state";
import { CONTACT_KIND_LABEL, contactHref } from "@/components/shared/format";
import { Section } from "./section";
import { api } from "@/lib/api-contract";
import type { ContactKind, ContactMethod } from "@/lib/types";

const KINDS: ContactKind[] = [
  "phone",
  "email",
  "website",
  "linkedin",
  "instagram",
  "x",
  "whatsapp",
  "telegram",
  "other",
];

export function ContactsSection({
  personId,
  contacts,
  onChanged,
}: {
  personId: string;
  contacts: ContactMethod[];
  onChanged: () => void;
}) {
  const [open, setOpen] = React.useState(false);

  return (
    <Section
      icon={UserRound}
      title="Contacts"
      count={contacts.length}
      action={<AddContactButton onClick={() => setOpen(true)} />}
    >
      {contacts.length === 0 ? (
        <EmptyState
          compact
          icon={UserRound}
          title="No contacts"
          description="Add a phone, email, or social handle."
        />
      ) : (
        <ul className="flex flex-col gap-0.5">
          {contacts.map((c) => (
            <ContactRow key={c.id} contact={c} onChanged={onChanged} />
          ))}
        </ul>
      )}

      <AddContactDialog
        personId={personId}
        open={open}
        onOpenChange={setOpen}
        onAdded={onChanged}
      />
    </Section>
  );
}

function AddContactButton({ onClick }: { onClick: () => void }) {
  return (
    <Button variant="ghost" size="xs" onClick={onClick} aria-label="Add contact">
      <Plus />
      Add
    </Button>
  );
}

function ContactRow({
  contact,
  onChanged,
}: {
  contact: ContactMethod;
  onChanged: () => void;
}) {
  const [removing, setRemoving] = React.useState(false);
  const href = contactHref(contact.kind, contact.value);
  const external =
    contact.kind !== "phone" &&
    contact.kind !== "whatsapp" &&
    contact.kind !== "email";

  async function remove() {
    setRemoving(true);
    try {
      await api.contacts.remove(contact.id);
      toast.success("Contact removed");
      onChanged();
    } catch {
      toast.error("Couldn't remove contact");
      setRemoving(false);
    }
  }

  const inner = (
    <>
      <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <ContactIcon kind={contact.kind} className="size-4" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{contact.value}</p>
        <p className="truncate text-xs text-muted-foreground">
          {CONTACT_KIND_LABEL[contact.kind]}
          {contact.label ? ` · ${contact.label}` : ""}
        </p>
      </div>
      {href ? (
        <ExternalLink className="size-3.5 shrink-0 text-muted-foreground/50" />
      ) : null}
    </>
  );

  return (
    <li className="group flex items-center gap-1">
      {href ? (
        <a
          href={href}
          {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
          className="flex min-w-0 flex-1 items-center gap-3 rounded-xl px-2 py-1.5 transition-colors hover:bg-muted/70"
        >
          {inner}
        </a>
      ) : (
        <div className="flex min-w-0 flex-1 items-center gap-3 rounded-xl px-2 py-1.5">
          {inner}
        </div>
      )}
      <Button
        variant="ghost"
        size="icon-xs"
        aria-label="Remove contact"
        onClick={remove}
        disabled={removing}
        className="shrink-0 text-muted-foreground/60 opacity-0 transition-opacity group-hover:opacity-100 hover:text-destructive focus-visible:opacity-100"
      >
        {removing ? <Loader2 className="animate-spin" /> : <Trash2 />}
      </Button>
    </li>
  );
}

function AddContactDialog({
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
  const [kind, setKind] = React.useState<ContactKind>("phone");
  const [value, setValue] = React.useState("");
  const [label, setLabel] = React.useState("");
  const [saving, setSaving] = React.useState(false);

  function reset() {
    setKind("phone");
    setValue("");
    setLabel("");
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const v = value.trim();
    if (!v) {
      toast.error("Enter a value");
      return;
    }
    setSaving(true);
    try {
      await api.contacts.create(personId, {
        kind,
        value: v,
        label: label.trim() || undefined,
      });
      toast.success("Contact added");
      onOpenChange(false);
      reset();
      onAdded();
    } catch {
      toast.error("Couldn't add contact");
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
          <DialogTitle>Add contact</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="flex flex-col gap-3">
          <div className="grid grid-cols-[7rem_1fr] gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="c-kind">Type</Label>
              <select
                id="c-kind"
                value={kind}
                onChange={(e) => setKind(e.target.value as ContactKind)}
                className="h-8 w-full rounded-lg border border-input bg-transparent px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
              >
                {KINDS.map((k) => (
                  <option key={k} value={k}>
                    {CONTACT_KIND_LABEL[k]}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="c-value">Value</Label>
              <Input
                id="c-value"
                autoFocus
                value={value}
                onChange={(e) => setValue(e.target.value)}
                placeholder={
                  kind === "email"
                    ? "name@email.com"
                    : kind === "phone" || kind === "whatsapp"
                      ? "+1 555 123 4567"
                      : "handle or url"
                }
                maxLength={200}
              />
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="c-label">Label (optional)</Label>
            <Input
              id="c-label"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="work, personal…"
              maxLength={40}
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
            <Button type="submit" disabled={saving || !value.trim()}>
              {saving ? <Loader2 className="animate-spin" /> : <Plus />}
              Add
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

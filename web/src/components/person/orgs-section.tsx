"use client";

import * as React from "react";
import { toast } from "sonner";
import { Building2, Loader2, Plus, Trash2 } from "lucide-react";

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
import { Section } from "./section";
import { api } from "@/lib/api-contract";
import type { PersonOrganizationLink } from "@/lib/types";

export function OrgsSection({
  personId,
  organizations,
  onChanged,
}: {
  personId: string;
  organizations: PersonOrganizationLink[];
  onChanged: () => void;
}) {
  const [open, setOpen] = React.useState(false);

  return (
    <Section
      icon={Building2}
      title="Organizations"
      count={organizations.length}
      action={
        <Button
          variant="ghost"
          size="xs"
          onClick={() => setOpen(true)}
          aria-label="Link organization"
        >
          <Plus />
          Add
        </Button>
      }
    >
      {organizations.length === 0 ? (
        <EmptyState
          compact
          icon={Building2}
          title="No organizations"
          description="Link a company, school, or club."
        />
      ) : (
        <ul className="flex flex-col gap-0.5">
          {organizations.map((link) => (
            <OrgRow key={link.id} link={link} onChanged={onChanged} />
          ))}
        </ul>
      )}

      <LinkOrgDialog
        personId={personId}
        open={open}
        onOpenChange={setOpen}
        onAdded={onChanged}
      />
    </Section>
  );
}

function OrgRow({
  link,
  onChanged,
}: {
  link: PersonOrganizationLink;
  onChanged: () => void;
}) {
  const [removing, setRemoving] = React.useState(false);
  const relParts = [link.relationship, link.role].filter(Boolean).join(" · ");

  async function remove() {
    setRemoving(true);
    try {
      await api.organizations.unlink(link.id);
      toast.success("Organization unlinked");
      onChanged();
    } catch {
      toast.error("Couldn't unlink");
      setRemoving(false);
    }
  }

  return (
    <li className="group flex items-center gap-3 rounded-xl px-2 py-1.5 transition-colors hover:bg-muted/70">
      <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
        <Building2 className="size-4" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{link.org.name}</p>
        {relParts ? (
          <p className="truncate text-xs text-muted-foreground capitalize">
            {relParts}
          </p>
        ) : link.org.type ? (
          <p className="truncate text-xs text-muted-foreground capitalize">
            {link.org.type}
          </p>
        ) : null}
      </div>
      <Button
        variant="ghost"
        size="icon-xs"
        aria-label="Unlink organization"
        onClick={remove}
        disabled={removing}
        className="shrink-0 text-muted-foreground/60 opacity-0 transition-opacity group-hover:opacity-100 hover:text-destructive focus-visible:opacity-100"
      >
        {removing ? <Loader2 className="animate-spin" /> : <Trash2 />}
      </Button>
    </li>
  );
}

function LinkOrgDialog({
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
  const [orgName, setOrgName] = React.useState("");
  const [relationship, setRelationship] = React.useState("");
  const [role, setRole] = React.useState("");
  const [saving, setSaving] = React.useState(false);

  function reset() {
    setOrgName("");
    setRelationship("");
    setRole("");
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const name = orgName.trim();
    if (!name) {
      toast.error("Enter an organization");
      return;
    }
    setSaving(true);
    try {
      await api.organizations.link(personId, {
        orgName: name,
        relationship: relationship.trim() || undefined,
        role: role.trim() || undefined,
      });
      toast.success("Organization linked");
      onOpenChange(false);
      reset();
      onAdded();
    } catch {
      toast.error("Couldn't link organization");
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
          <DialogTitle>Link organization</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="flex flex-col gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor="o-name">Organization</Label>
            <Input
              id="o-name"
              autoFocus
              value={orgName}
              onChange={(e) => setOrgName(e.target.value)}
              placeholder="Acme Inc, Stanford…"
              maxLength={120}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="o-rel">Relationship</Label>
              <Input
                id="o-rel"
                value={relationship}
                onChange={(e) => setRelationship(e.target.value)}
                placeholder="works at"
                maxLength={60}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="o-role">Role</Label>
              <Input
                id="o-role"
                value={role}
                onChange={(e) => setRole(e.target.value)}
                placeholder="Engineer"
                maxLength={60}
              />
            </div>
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
            <Button type="submit" disabled={saving || !orgName.trim()}>
              {saving ? <Loader2 className="animate-spin" /> : <Plus />}
              Link
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
